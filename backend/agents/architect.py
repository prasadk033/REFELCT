import json
import logging
import time
from typing import Dict, Any, List, Set
from haystack import Pipeline
from haystack.components.routers import ConditionalRouter
from haystack.components.joiners import BranchJoiner
from agents.requirement_agent import RequirementAgent
from agents.analysis_agent import AnalysisAgent
from agents.research_agent import ResearchAgent
from agents.validation_agent import ValidationAgent
from agents.report_agent import ReportAgent
from memory.redis_store import redis_store
from llm.provider import LiteLLMGenerator
from config import config
from schemas.models import CoordinatorEvaluationResult, FinalReport
from agents.prompts import ARCHITECT_EVALUATOR_PROMPT
import concurrent.futures

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class VirtualArchitect:
    """
    Main Coordinator Agent.
    Manages the overall workflow, delegates to specialists, evaluates, and controls retry logic.
    """
    def __init__(self):
        self.requirement_agent = RequirementAgent()
        self.analysis_agent = AnalysisAgent()
        self.research_agent = ResearchAgent()
        self.validation_agent = ValidationAgent()
        self.report_agent = ReportAgent()
        self.evaluator_llm = LiteLLMGenerator()

    def run_workflow(self, session_id: str, document_text: str) -> FinalReport:
        # Initial execution: Run all independent specialists in parallel
        agents = {
            "requirement_agent": self.requirement_agent,
            "analysis_agent": self.analysis_agent,
            "research_agent": self.research_agent,
            "validation_agent": self.validation_agent
        }
        
        # Parallel execution using ThreadPoolExecutor for Haystack components
        logger.info(f"[{session_id}] Starting parallel execution of independent agents.")
        self._execute_agents_parallel(agents, document_text, session_id)
        
        # Evaluation and Retry Loop
        max_total_iterations = 10 # Failsafe
        iteration = 0
        
        while iteration < max_total_iterations:
            iteration += 1
            
            # 1. Collect current responses from Redis
            responses = redis_store.get_all_agent_responses(session_id)
            
            # 2. Evaluate responses
            evaluation = self._evaluate_responses(document_text, responses)
            
            # 3. Check if satisfied
            unsatisfied_agents = [ev for ev in evaluation.evaluations if not ev.satisfied]
            
            if not unsatisfied_agents:
                # All satisfied, move to final synthesis
                break
                
            # 4. Selective Retry
            agents_to_retry = {}
            retry_instructions = {}
            
            for ev in unsatisfied_agents:
                agent_name = ev.agent_name
                retry_count = redis_store.get_retry_count(session_id, agent_name)
                
                if retry_count < config.MAX_AGENT_RETRIES:
                    agents_to_retry[agent_name] = agents[agent_name]
                    retry_instructions[agent_name] = ev.retry_instructions
                    redis_store.increment_retry_count(session_id, agent_name)
                else:
                    # Mark as unresolved limit reached, keep it in responses, do not retry
                    pass
            
            if not agents_to_retry:
                # No more agents can be retried due to limits
                break
                
            # Execute ONLY the retrying agents
            self._execute_agents_parallel(agents_to_retry, document_text, session_id, retry_instructions)
            
        # Final Synthesis
        logger.info(f"[{session_id}] Starting Report Agent synthesis.")
        final_responses = redis_store.get_all_agent_responses(session_id)
        
        start_time = time.time()
        report_result = self.report_agent.run(document_text=document_text, specialist_responses=final_responses)
        elapsed = time.time() - start_time
        logger.info(f"[{session_id}] Report Agent completed synthesis in {elapsed:.2f} seconds.")
        
        final_report = report_result["report"]
        redis_store.set_final_result(session_id, final_report)
        return final_report

    def _execute_agents_parallel(self, agents_dict: Dict[str, Any], document_text: str, session_id: str, retry_instructions: Dict[str, str] = None):
        """
        Executes given agent components in parallel using concurrent.futures
        """
        if retry_instructions is None:
            retry_instructions = {}
            
        def run_agent(name, agent):
            instructions = retry_instructions.get(name)
            logger.info(f"[{session_id}] Agent '{name}' started execution.")
            start_time = time.time()
            
            res = agent.run(document_text=document_text, session_id=session_id, retry_instructions=instructions)
            
            elapsed = time.time() - start_time
            logger.info(f"[{session_id}] Agent '{name}' completed in {elapsed:.2f} seconds.")
            
            # Store in Redis
            response_obj = res["response"]
            redis_store.set_agent_response(session_id, name, response_obj.model_dump())
            return name
            
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(agents_dict)) as executor:
            futures = [executor.submit(run_agent, name, agent) for name, agent in agents_dict.items()]
            concurrent.futures.wait(futures)
            for future in futures:
                if future.exception():
                    logger.error(f"[{session_id}] Agent execution failed: {future.exception()}")
                    raise future.exception()

    def _evaluate_responses(self, document_text: str, responses: Dict[str, Any]) -> CoordinatorEvaluationResult:
        prompt = ARCHITECT_EVALUATOR_PROMPT.format(responses_json=json.dumps(responses))
        
        result = self.evaluator_llm.run(prompt=prompt)
        text_response = result["replies"][0]
        
        try:
            if text_response.startswith("```json"):
                text_response = text_response.split("```json")[1].split("```")[0].strip()
            elif text_response.startswith("```"):
                text_response = text_response.split("```")[1].split("```")[0].strip()
                
            data = json.loads(text_response)
            evals = CoordinatorEvaluationResult(**data)
            return evals
        except Exception as e:
            # On failure, assume all satisfied to avoid infinite loop of failures
            return CoordinatorEvaluationResult(evaluations=[])

architect = VirtualArchitect()
