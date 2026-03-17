"""
SmartCache - Universal Cache Management

A high-performance, multi-language cache management system
with intelligent eviction policies (LRU + TTL + Priority).
"""

import time
import json
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable
from enum import IntEnum
from datetime import datetime


class Priority(IntEnum):
    """Priority levels for cache entries"""
    CRITICAL = 0
    HIGH = 1
    MEDIUM = 2
    LOW = 3


@dataclass
class CacheEntry:
    """Cache entry with metadata"""
    key: str
    value: Any
    created_at: float
    last_accessed: float
    ttl_seconds: int
    priority: Priority
    access_count: int = 0
    tags: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        if isinstance(self.priority, int):
            self.priority = Priority(self.priority)
    
    def is_expired(self) -> bool:
        if self.ttl_seconds == 0:
            return False
        age = time.time() - self.created_at
        return age >= self.ttl_seconds
    
    def touch(self):
        self.last_accessed = time.time()
        self.access_count += 1
    
    @property
    def size_bytes(self) -> int:
        try:
            return len(json.dumps(self.value).encode('utf-8'))
        except:
            return 0


@dataclass
class CacheStats:
    """Cache statistics"""
    total_items: int = 0
    total_size_bytes: int = 0
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    hit_rate: float = 0.0


@dataclass
class EvictionRecord:
    """Record of evicted entry"""
    key: str
    reason: str
    timestamp: str


@dataclass
class CleanupResult:
    """Result of cleanup operation"""
    expired_count: int
    freed_bytes: int


class SmartCache:
    """
    SmartCache - High-performance cache with intelligent eviction
    
    Features:
    - LRU Eviction (Least Recently Used)
    - TTL Support (Time To Live)
    - Priority Levels (critical, high, medium, low)
    - Size Limits with auto-cleanup
    - Thread-safe operations
    - Event callbacks
    """
    
    def __init__(
        self,
        max_items: int = 1000,
        max_size: str = "500MB",
        default_ttl: int = 300,
        cleanup_interval: int = 60,
    ):
        self._entries: Dict[str, CacheEntry] = {}
        self._lock = threading.RLock()
        self._evictions: List[EvictionRecord] = []
        
        self._max_items = max_items
        self._max_size_bytes = self._parse_size(max_size)
        self._default_ttl = default_ttl
        self._cleanup_interval = cleanup_interval
        
        self._stats = CacheStats()
        
        # Event callbacks
        self._on_hit: Optional[Callable] = None
        self._on_miss: Optional[Callable] = None
        self._on_eviction: Optional[Callable] = None
        self._on_cleanup: Optional[Callable] = None
        
        # Start cleanup thread
        self._start_cleanup_thread()
    
    def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        priority: Priority = Priority.MEDIUM,
        tags: Optional[List[str]] = None,
    ):
        """Set a cache entry"""
        ttl_seconds = ttl if ttl is not None else self._default_ttl
        tags = tags or []
        
        with self._lock:
            # Check if we need to evict
            entry_size = self._estimate_size(value)
            self._maybe_evict(entry_size)
            
            # Create entry
            now = time.time()
            entry = CacheEntry(
                key=key,
                value=value,
                created_at=now,
                last_accessed=now,
                ttl_seconds=ttl_seconds,
                priority=priority,
                tags=tags,
            )
            
            self._entries[key] = entry
            self._update_stats()
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get a cache entry"""
        with self._lock:
            entry = self._entries.get(key)
            
            if entry is None:
                self._stats.misses += 1
                if self._on_miss:
                    self._on_miss({"key": key})
                return default
            
            # Check expiry
            if entry.is_expired():
                self._remove(key, "TTL_EXPIRED")
                self._stats.misses += 1
                if self._on_miss:
                    self._on_miss({"key": key, "reason": "expired"})
                return default
            
            # Touch the entry
            entry.touch()
            
            # Update stats
            self._stats.hits += 1
            self._update_hit_rate()
            self._update_stats()
            
            if self._on_hit:
                self._on_hit({"key": key, "size": entry.size_bytes})
            
            return entry.value
    
    def has(self, key: str) -> bool:
        """Check if key exists"""
        return self.get(key) is not None
    
    def remove(self, key: str) -> bool:
        """Remove a cache entry"""
        with self._lock:
            return self._remove(key, "MANUAL")
    
    def clear(self):
        """Clear all entries"""
        with self._lock:
            self._entries.clear()
            self._stats.total_items = 0
            self._stats.total_size_bytes = 0
    
    def stats(self) -> CacheStats:
        """Get cache statistics"""
        with self._lock:
            return CacheStats(
                total_items=self._stats.total_items,
                total_size_bytes=self._stats.total_size_bytes,
                hits=self._stats.hits,
                misses=self._stats.misses,
                evictions=self._stats.evictions,
                hit_rate=self._stats.hit_rate,
            )
    
    def recent_evictions(self, limit: int = 10) -> List[EvictionRecord]:
        """Get recent evictions"""
        with self._lock:
            return self._evictions[-limit:]
    
    def get_by_tag(self, tag: str) -> List[Dict[str, Any]]:
        """Get entries by tag"""
        with self._lock:
            results = []
            for key, entry in self._entries.items():
                if tag in entry.tags:
                    results.append({"key": key, "value": entry.value})
            return results
    
    def evict_by_tag(self, tag: str) -> int:
        """Evict entries by tag"""
        with self._lock:
            keys_to_remove = [
                key for key, entry in self._entries.items()
                if tag in entry.tags
            ]
            
            for key in keys_to_remove:
                self._remove(key, "MANUAL")
            
            return len(keys_to_remove)
    
    def cleanup(self) -> CleanupResult:
        """Cleanup expired entries"""
        with self._lock:
            expired_count = 0
            freed_bytes = 0
            
            keys_to_remove = []
            for key, entry in self._entries.items():
                if entry.is_expired():
                    keys_to_remove.append(key)
                    freed_bytes += entry.size_bytes
            
            for key in keys_to_remove:
                self._remove(key, "TTL_EXPIRED")
                expired_count += 1
            
            self._update_stats()
            
            if self._on_cleanup and expired_count > 0:
                self._on_cleanup({
                    "expired_count": expired_count,
                    "freed_bytes": freed_bytes,
                })
            
            return CleanupResult(expired_count=expired_count, freed_bytes=freed_bytes)
    
    def destroy(self):
        """Destroy the cache instance"""
        self._stop_cleanup = True
        self.clear()
    
    # Event callbacks
    def on_hit(self, callback: Callable):
        self._on_hit = callback
        return self
    
    def on_miss(self, callback: Callable):
        self._on_miss = callback
        return self
    
    def on_eviction(self, callback: Callable):
        self._on_eviction = callback
        return self
    
    def on_cleanup(self, callback: Callable):
        self._on_cleanup = callback
        return self
    
    # Private methods
    
    def _parse_size(self, size: str) -> int:
        if isinstance(size, int):
            return size
        
        size = size.upper().strip()
        if size.endswith("GB"):
            return int(float(size[:-2]) * 1024 * 1024 * 1024)
        elif size.endswith("MB"):
            return int(float(size[:-2]) * 1024 * 1024)
        elif size.endswith("KB"):
            return int(float(size[:-2]) * 1024)
        else:
            return int(size)
    
    def _estimate_size(self, value: Any) -> int:
        try:
            return len(json.dumps(value).encode('utf-8'))
        except:
            return 0
    
    def _maybe_evict(self, new_size: int):
        current_size = self._stats.total_size_bytes
        current_items = len(self._entries)
        
        # Check item limit
        if current_items >= self._max_items:
            self._evict_lru(1)
        
        # Check size limit
        if current_size + new_size > self._max_size_bytes:
            bytes_needed = (current_size + new_size) - self._max_size_bytes
            self._evict_by_size(bytes_needed)
    
    def _evict_lru(self, count: int):
        priority_order = {
            Priority.CRITICAL: 0,
            Priority.HIGH: 1,
            Priority.MEDIUM: 2,
            Priority.LOW: 3,
        }
        
        # Sort by priority and last_accessed
        entries = sorted(
            [
                (key, entry)
                for key, entry in self._entries.items()
                if entry.priority != Priority.CRITICAL
            ],
            key=lambda x: (priority_order[x[1].priority], x[1].last_accessed),
        )
        
        for key, entry in entries[:count]:
            self._remove(key, "LRU")
    
    def _evict_by_size(self, bytes_needed: int):
        freed = 0
        priority_order = {
            Priority.CRITICAL: 0,
            Priority.HIGH: 1,
            Priority.MEDIUM: 2,
            Priority.LOW: 3,
        }
        
        entries = sorted(
            [
                (key, entry)
                for key, entry in self._entries.items()
                if entry.priority != Priority.CRITICAL
            ],
            key=lambda x: (priority_order[x[1].priority], x[1].last_accessed),
        )
        
        for key, entry in entries:
            if freed >= bytes_needed:
                break
            freed += entry.size_bytes
            self._remove(key, "LRU")
    
    def _remove(self, key: str, reason: str) -> bool:
        if key not in self._entries:
            return False
        
        entry = self._entries.pop(key)
        self._stats.evictions += 1
        self._update_stats()
        
        # Record eviction
        self._evictions.append(
            EvictionRecord(
                key=key,
                reason=reason,
                timestamp=datetime.now().isoformat(),
            )
        )
        
        # Keep only last 100 evictions
        if len(self._evictions) > 100:
            self._evictions.pop(0)
        
        if self._on_eviction:
            self._on_eviction({"key": key, "reason": reason})
        
        return True
    
    def _update_stats(self):
        total_size = sum(entry.size_bytes for entry in self._entries.values())
        self._stats.total_items = len(self._entries)
        self._stats.total_size_bytes = total_size
    
    def _update_hit_rate(self):
        total = self._stats.hits + self._stats.misses
        if total > 0:
            self._stats.hit_rate = (self._stats.hits / total) * 100
    
    def _start_cleanup_thread(self):
        self._stop_cleanup = False
        
        def cleanup_loop():
            while not self._stop_cleanup:
                time.sleep(self._cleanup_interval)
                if not self._stop_cleanup:
                    self.cleanup()
        
        thread = threading.Thread(target=cleanup_loop, daemon=True)
        thread.start()


# Convenience function
def create_cache(
    max_size: str = "500MB",
    default_ttl: int = 300,
    **kwargs
) -> SmartCache:
    """Create a new cache instance"""
    return SmartCache(max_size=max_size, default_ttl=default_ttl, **kwargs)
