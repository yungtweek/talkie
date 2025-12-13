from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WeaviateSearchType(str, Enum):
    NEAR_TEXT = "near_text"
    HYBRID = "hybrid"


class RagConfig(BaseModel):
    """RAG-specific configuration (weaviate + prompt knobs)."""

    model_config = ConfigDict(extra="ignore")

    weaviate_url: Optional[str] = Field(default=None)
    weaviate_api_key: Optional[str] = Field(default=None)
    collection: str = Field(default="Chunks")
    text_key: str = Field(default="text")
    embedding_model: Optional[str] = Field(default=None)

    top_k: int = Field(default=10)
    mmq: int = Field(default=3)
    max_context: int = Field(default=3500)
    search_type: WeaviateSearchType = Field(default=WeaviateSearchType.HYBRID)
    alpha: float = Field(default=0.6, description="Hybrid search weighting (0.0=bm25 only, 1.0=vector only)")
    alpha_multi_strong_max: Optional[float] = Field(default=0.45)
    alpha_single_strong_min: Optional[float] = Field(default=0.55)
    alpha_weak_hit_min: Optional[float] = Field(default=0.30)
    alpha_no_bm25_min: Optional[float] = Field(default=0.10)

    fusion_type: Optional[str] = Field(default="relative")
    bm25_query_properties: list[str] = Field(default_factory=lambda: ["text", "text_tri", "filename", "filename_kw"])

    normalize_nfc: bool = Field(default=True)
    strip_punct: bool = Field(default=True)
    lowercase_query: bool = Field(default=False)
    ko_min_token_len: int = Field(default=2)
    ko_keep_english: bool = Field(default=True)
    ko_keep_numeric: bool = Field(default=False)
    ko_stop_tokens: list[str] = Field(
        default_factory=lambda: [
            # 조사/어미
            "은", "는", "이", "가", "을", "를", "에", "에서", "에게", "께", "으로", "로", "과", "와", "도", "만", "까지", "부터",
            "의", "보다", "마저", "조차", "든지", "라고", "이라고", "까지의", "같은", "하는", "된", "하여", "하게", "하며",
            # 접속/불용
            "그리고", "그러나", "하지만", "또", "또는", "및", "또한", "그래서", "그러므로", "때문에", "때문", "즉", "예를", "들어",
            # 의문/감탄/형태 보정
            "무엇", "어떤", "왜", "어떻게", "하면", "해주세요", "해주세요.", "해줘", "알려줘", "대해", "관련", "것", "부분", "수", "대한",
            # 구두어/채움
            "음", "어", "어어", "어허", "자", "좀", "그", "이", "저", "내", "너", "너희", "우리", "같아", "같은데", "요", "요.", "고마워",
        ]
    )

    rag_prompt: str = Field(
        default=(
            "당신은 친절하고 정확한 AI 어시스턴트입니다.\n"
            "- 제공된 Context만으로 답하세요.\n"
            "- Context는 여러 문서 조각으로 구성되어 있으며, 순서와 관계없이 모두 참고하세요.\n"
            "- 모르면 모른다고 말하세요.\n"
            "- 출처가 되는 문서 제목/섹션을 간단히 써주세요.\n"
            "- 출처가 없는 경우 출처를 표기하지 마세요."
        ),
    )

    @model_validator(mode="after")
    def normalize_properties(self):
        """Normalize bm25 props and align placeholder names."""
        if self.bm25_query_properties:
            mapped = [(self.text_key if x == "content" else x) for x in self.bm25_query_properties]
            seen: set[str] = set()
            self.bm25_query_properties = [x for x in mapped if not (x in seen or seen.add(x))]
        return self
