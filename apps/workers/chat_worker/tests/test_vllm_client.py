import unittest
from types import SimpleNamespace

from langchain_core.messages import HumanMessage

from chat_worker.infrastructure.langchain.vllm_client import VllmGrpcClient


class DummyStub:
    def __init__(self, chunks):
        self._chunks = chunks

    async def ChatCompletionStream(self, _req, timeout=None):
        _ = timeout
        for chunk in self._chunks:
            yield chunk


class RecordingCallback:
    def __init__(self) -> None:
        self.errors = []
        self.ends = []

    async def on_llm_error(self, exc, run_id=None, tags=None):
        _ = run_id, tags
        self.errors.append(exc)

    async def on_llm_end(self, llm_result, run_id=None, tags=None):
        _ = run_id, tags
        self.ends.append(llm_result)


class VllmClientStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_astream_raises_on_failed_chunk(self):
        chunk = SimpleNamespace(type="failed", finish_reason="stream failed")
        cb = RecordingCallback()
        client = VllmGrpcClient(addr="localhost:0", model="dummy", timeout_ms=1)
        client._stub = DummyStub([chunk])

        messages = [HumanMessage(content="hi")]

        with self.assertRaises(RuntimeError) as ctx:
            await client.astream(messages, config={"callbacks": [cb], "tags": []})

        self.assertEqual(str(ctx.exception), "stream failed")
        self.assertEqual(len(cb.errors), 1)
        self.assertEqual(str(cb.errors[0]), "stream failed")
        self.assertEqual(len(cb.ends), 0)


if __name__ == "__main__":
    unittest.main()
