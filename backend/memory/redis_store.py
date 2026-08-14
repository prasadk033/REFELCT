import json
import redis
from typing import Dict, Any, Optional
from config import config
from schemas.models import FinalReport

class RedisStore:
    def __init__(self):
        self.redis_client = redis.Redis.from_url(
            config.REDIS_URL,
            decode_responses=True
        )
    
    def set_session_state(self, session_id: str, state: Dict[str, Any]):
        self.redis_client.set(f"state:{session_id}", json.dumps(state))

    def get_session_state(self, session_id: str) -> Optional[Dict[str, Any]]:
        data = self.redis_client.get(f"state:{session_id}")
        return json.loads(data) if data else None

    def set_agent_response(self, session_id: str, agent_name: str, response: Dict[str, Any]):
        self.redis_client.set(f"responses:{session_id}:{agent_name}", json.dumps(response))
        
    def get_agent_response(self, session_id: str, agent_name: str) -> Optional[Dict[str, Any]]:
        data = self.redis_client.get(f"responses:{session_id}:{agent_name}")
        return json.loads(data) if data else None

    def get_all_agent_responses(self, session_id: str) -> Dict[str, Any]:
        keys = self.redis_client.keys(f"responses:{session_id}:*")
        responses = {}
        for key in keys:
            agent_name = key.split(":")[-1]
            data = self.redis_client.get(key)
            if data:
                responses[agent_name] = json.loads(data)
        return responses

    def increment_retry_count(self, session_id: str, agent_name: str) -> int:
        return self.redis_client.hincrby(f"retries:{session_id}", agent_name, 1)
        
    def get_retry_count(self, session_id: str, agent_name: str) -> int:
        val = self.redis_client.hget(f"retries:{session_id}", agent_name)
        return int(val) if val else 0

    def set_final_result(self, session_id: str, result: FinalReport):
        self.redis_client.set(f"result:{session_id}", result.model_dump_json())

    def get_final_result(self, session_id: str) -> Optional[Dict[str, Any]]:
        data = self.redis_client.get(f"result:{session_id}")
        return json.loads(data) if data else None

redis_store = RedisStore()
