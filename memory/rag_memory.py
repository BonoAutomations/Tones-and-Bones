"""RAG-based persistent memory system using ChromaDB.

Provides cross-session memory for experiments, decisions, and context.
Every task outcome, experiment result, and architectural decision is stored
and retrievable via semantic search for future sessions.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings


class RAGMemory:
    """Persistent vector-store memory for agent context across sessions."""

    def __init__(
        self,
        persist_dir: str = "memory/chroma_store",
        collection_name: str = "session_memory",
    ) -> None:
        Path(persist_dir).mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def store(
        self,
        content: str,
        metadata: dict[str, Any] | None = None,
        category: str = "general",
    ) -> str:
        """Store a memory entry. Returns the generated ID."""
        ts = datetime.now(timezone.utc).isoformat()
        doc_id = f"{category}_{ts}_{self._collection.count()}"
        meta = {
            "category": category,
            "timestamp": ts,
            **(metadata or {}),
        }
        # ChromaDB metadata values must be str, int, float, or bool
        meta = {k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in meta.items()}
        self._collection.add(
            ids=[doc_id],
            documents=[content],
            metadatas=[meta],
        )
        return doc_id

    def recall(
        self,
        query: str,
        n_results: int = 5,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Retrieve the most relevant memories for a given query."""
        where = {"category": category} if category else None
        results = self._collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where,
        )
        entries: list[dict[str, Any]] = []
        if results["documents"]:
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ):
                entries.append({
                    "content": doc,
                    "metadata": meta,
                    "relevance_score": 1.0 - dist,
                })
        return entries

    def store_experiment(
        self,
        experiment_name: str,
        metrics: dict[str, float],
        params: dict[str, Any],
        notes: str = "",
    ) -> str:
        """Store an experiment result for future recall."""
        content = (
            f"Experiment: {experiment_name}\n"
            f"Metrics: {json.dumps(metrics)}\n"
            f"Params: {json.dumps(params)}\n"
            f"Notes: {notes}"
        )
        return self.store(
            content=content,
            metadata={"experiment": experiment_name, "metrics": metrics},
            category="experiment",
        )

    def store_decision(self, decision: str, reasoning: str, context: str = "") -> str:
        """Store an architectural or design decision."""
        content = f"Decision: {decision}\nReasoning: {reasoning}\nContext: {context}"
        return self.store(content=content, category="decision")

    def get_all(self, category: str | None = None) -> list[dict[str, Any]]:
        """Retrieve all stored memories, optionally filtered by category."""
        where = {"category": category} if category else None
        results = self._collection.get(where=where)
        entries: list[dict[str, Any]] = []
        if results["documents"]:
            for doc, meta in zip(results["documents"], results["metadatas"]):
                entries.append({"content": doc, "metadata": meta})
        return entries

    @property
    def count(self) -> int:
        return self._collection.count()
