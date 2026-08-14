import os
from typing import Dict, Any, List, Optional

import litellm
from dotenv import load_dotenv
from haystack import component

load_dotenv()


@component
class LiteLLMGenerator:
    """
    Haystack component that sends LLM requests
    through the local LiteLLM Proxy Server.
    """

    def __init__(self, model_name: Optional[str] = None, **kwargs):
        # Must match the model_name configured in litellm_config.yaml
        self.model = model_name or "qwen"

        # LiteLLM Proxy URL
        self.api_base = os.getenv(
            "LITELLM_API_BASE",
            "http://localhost:4000"
        )

        # Authentication key for LiteLLM Proxy
        self.api_key = os.getenv("LITELLM_MASTER_KEY")

        self.kwargs = kwargs

    @component.output_types(
        replies=List[str],
        meta=List[Dict[str, Any]]
    )
    def run(self, prompt: str):
        """
        Send the prompt through the local LiteLLM Proxy.
        """
        import time

        messages = [
            {
                "role": "user",
                "content": prompt
            }
        ]

        timeout_val = self.kwargs.pop("timeout", 180.0)
        start_time = time.time()

        try:
            response = litellm.completion(
                # OpenAI-compatible interface exposed by LiteLLM Proxy
                model=self.model,
                messages=messages,
                api_base=f"{self.api_base}/v1",
                api_key=self.api_key,
                custom_llm_provider="openai",
                timeout=timeout_val,
                **self.kwargs
            )

            content = response.choices[0].message.content

            usage = {}

            if response.usage:
                try:
                    usage = response.usage.model_dump()
                except AttributeError:
                    usage = dict(response.usage)

            meta = {
                "model": self.model,
                "usage": usage
            }

            return {
                "replies": [content],
                "meta": [meta]
            }

        except Exception as e:
            elapsed = time.time() - start_time
            is_timeout = isinstance(e, litellm.exceptions.Timeout) or "timeout" in str(e).lower()
            
            if is_timeout:
                print(f"LLM generation timeout error: model={self.model}, timeout_duration={timeout_val}s, elapsed={elapsed:.2f}s, error={e}")
                raise TimeoutError(f"LLM Request Timed Out after {elapsed:.2f}s") from e
            else:
                print(f"LLM generation error: model={self.model}, elapsed={elapsed:.2f}s, error={e}")
                raise RuntimeError(f"LLM Request Failed: {e}") from e


def get_llm_generator(**kwargs) -> LiteLLMGenerator:
    """
    Factory function to create the configured LLM Generator.
    """
    return LiteLLMGenerator(**kwargs)