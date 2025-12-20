import unittest
from typing import Any, List

from langchain_core.messages import HumanMessage

from chat_worker.application.llm_runner import llm_runner
from chat_worker.application.rag.document import Document
from chat_worker.application.rag_chain import RagPipeline
from chat_worker.config.rag import RagConfig


class DummyEmbeddings:
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [[0.0, 0.0, 0.0] for _ in texts]

    def embed_query(self, text: str) -> List[float]:
        return [0.0, 0.0, 0.0]


class DummyPrompt:
    def to_messages(self) -> list[HumanMessage]:
        return [HumanMessage(content="test")]


class DummyChain:
    async def ainvoke(self, _inputs: dict) -> dict:
        return {"prompt": DummyPrompt(), "citations": [{"id": "S1"}]}


class DummyLlm:
    provider = "test"
    model = "test"

    async def astream(self, _messages: list, _config: Any = None) -> None:
        return None


class RagCitationTests(unittest.TestCase):
    def test_join_context_builds_citations(self) -> None:
        rag_cfg = RagConfig(max_context=1000)
        pipeline = RagPipeline(settings=rag_cfg, embeddings=DummyEmbeddings())
        docs = [
            Document(
                title="Doc1",
                page_content="alpha",
                chunk_id="c1",
                page=1,
                uri="https://example.com/1",
                metadata={"rerank_score": 0.9},
            ),
            Document(
                title="Doc2",
                page_content="beta",
                chunk_id="c2",
                page=2,
            ),
        ]

        context, citations = pipeline.join_context(docs)

        self.assertIn("[Doc1]", context)
        self.assertEqual(len(citations), 2)
        self.assertEqual(citations[0]["source_id"], "S1")
        self.assertEqual(citations[0]["chunk_id"], "c1")
        self.assertEqual(citations[0]["page"], 1)
        self.assertEqual(citations[0]["uri"], "https://example.com/1")
        self.assertEqual(citations[0]["rerank_score"], 0.9)
        self.assertEqual(citations[0]["score"], 0.9)

    def test_join_context_respects_budget(self) -> None:
        rag_cfg = RagConfig(max_context=4)
        pipeline = RagPipeline(settings=rag_cfg, embeddings=DummyEmbeddings())
        docs = [
            Document(title="Doc1", page_content="abcd", chunk_id="c1"),
            Document(title="Doc2", page_content="efgh", chunk_id="c2"),
        ]

        _context, citations = pipeline.join_context(docs)

        self.assertEqual(len(citations), 1)
        self.assertEqual(citations[0]["chunk_id"], "c1")


class LlmRunnerSourcesEventTests(unittest.IsolatedAsyncioTestCase):
    async def test_llm_runner_emits_sources_event(self) -> None:
        published: list[dict] = []
        mirrored: list[str] = []

        async def publish(evt: dict) -> None:
            published.append(evt)

        async def on_event(event_type: str, _data: dict) -> None:
            mirrored.append(event_type)

        await llm_runner(
            llm=DummyLlm(),
            job_id="job-1",
            user_id="user-1",
            messages=[],
            chain=DummyChain(),
            chain_input={"question": "q"},
            publish=publish,
            on_event=on_event,
            on_done=None,
            on_error=None,
        )

        self.assertTrue(any(evt.get("event") == "sources" for evt in published))
        self.assertIn("sources", mirrored)
