import os
from typing import Dict, Any, List, Optional

import litellm
from dotenv import load_dotenv
from config import config
from haystack import component


@component
class LiteLLMGenerator:
    """
    Haystack component that sends LLM requests
    through the local LiteLLM Proxy Server.
    """

    def __init__(self, model_name: Optional[str] = None, **kwargs):
        # Must match the model_name configured in litellm_config.yaml
        self.model = model_name or config.LLM_MODEL

        # LiteLLM Proxy URL
        self.api_base = config.LITELLM_API_BASE

        # Authentication key for LiteLLM Proxy
        self.api_key = config.LITELLM_MASTER_KEY

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

        timeout_val = self.kwargs.pop("timeout", 20.0)
        start_time = time.time()

        try:
            response = litellm.completion(
                # OpenAI-compatible interface exposed by LiteLLM Proxy
                model=self.model,
                messages=messages,
                api_base=f"{self.api_base.rstrip('/')}/v1" if not self.api_base.rstrip('/').endswith("/v1") else self.api_base.rstrip('/'),
                api_key=self.api_key or "sk-datai2i-a100-qwen35-27b-8x3f9z",
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