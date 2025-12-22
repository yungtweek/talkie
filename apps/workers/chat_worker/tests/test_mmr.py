import unittest

from chat_worker.application.rag.document import Document, items_to_docs
from chat_worker.application.rag.postprocessors.mmr import MMRConfig, mmr_select


class MMRTests(unittest.TestCase):
    def _doc(self, doc_id: str, score: float, vector=None) -> Document:
        doc = Document(doc_id=doc_id, page_content=doc_id, score=score)
        if vector is not None:
            doc.metadata["vector"] = vector
        return doc

    def test_mmr_prefers_diverse_when_vectors_present(self):
        docs = [
            self._doc("d0", 1.0, [1.0, 0.0]),
            self._doc("d1", 0.9, [1.0, 0.0]),
            self._doc("d2", 0.8, [0.0, 1.0]),
        ]
        cfg = MMRConfig(lambda_mult=0.5, k=2, fetch_k=3)
        out = mmr_select(query="q", docs=docs, cfg=cfg)
        self.assertEqual([d.doc_id for d in out], ["d0", "d2"])

    def test_mmr_falls_back_to_relevance_without_vectors(self):
        docs = [
            self._doc("d0", 1.0),
            self._doc("d1", 0.9),
            self._doc("d2", 0.8),
        ]
        cfg = MMRConfig(lambda_mult=0.5, k=2, fetch_k=3)
        out = mmr_select(query="q", docs=docs, cfg=cfg)
        self.assertEqual([d.doc_id for d in out], ["d0", "d1"])

    def test_mmr_uses_vectors_from_items_to_docs(self):
        class DummyDoc:
            def __init__(self, doc_id: str, score: float, vector):
                self.page_content = doc_id
                self.metadata = {"id": doc_id, "score": score}
                self.vector = vector

        items = [
            DummyDoc("d0", 1.0, [1.0, 0.0]),
            DummyDoc("d1", 0.9, [1.0, 0.0]),
            DummyDoc("d2", 0.8, [0.0, 1.0]),
        ]
        docs = items_to_docs(items, text_key="text")
        for doc in docs:
            self.assertIn("vector", doc.metadata)

        cfg = MMRConfig(lambda_mult=0.5, k=2, fetch_k=3)
        out = mmr_select(query="q", docs=docs, cfg=cfg)
        self.assertEqual([d.doc_id for d in out], ["d0", "d2"])


if __name__ == "__main__":
    unittest.main()
