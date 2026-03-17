"""
FastAPI middleware for SmartCache
"""

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from typing import Callable, Optional, Dict, Any
import hashlib
import json

from . import SmartCache, Priority


class CacheMiddleware:
    """
    FastAPI middleware for automatic response caching
    """
    
    def __init__(
        self,
        app: FastAPI,
        ttl: int = 300,
        priority: Priority = Priority.MEDIUM,
        skip_paths: Optional[list] = None,
    ):
        self.app = app
        self.cache = SmartCache(default_ttl=ttl)
        self.ttl = ttl
        self.priority = priority
        self.skip_paths = skip_paths or []
        
        app.add_middleware(CacheMiddleware, self)
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        
        request = Request(scope, receive)
        
        # Skip certain paths
        if any(request.url.path.startswith(path) for path in self.skip_paths):
            return await self.app(scope, receive, send)
        
        # Generate cache key
        cache_key = self._generate_cache_key(request)
        
        # Try to get from cache
        cached = self.cache.get(cache_key)
        if cached:
            response = JSONResponse(content=cached)
            response.headers["X-Cache"] = "HIT"
            response.headers["X-Cache-Key"] = cache_key
            return response
        
        # Create response collector
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = message.get("headers", [])
                headers.append((b"x-cache", b"MISS"))
                headers.append((b"x-cache-key", cache_key.encode()))
                message["headers"] = headers
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                if body:
                    try:
                        data = json.loads(body)
                        self.cache.set(cache_key, data, ttl=self.ttl, priority=self.priority)
                    except:
                        pass
            await send(message)
        
        await self.app(scope, receive, send_wrapper)


def cache_middleware(
    ttl: int = 300,
    priority: str = "medium",
    key_generator: Optional[Callable[[Request], str]] = None,
    skip: Optional[Callable[[Request], bool]] = None,
):
    """
    Decorator for caching route responses
    
    Usage:
        @app.get("/products")
        @cache_middleware(ttl=300)
        async def get_products():
            return {"products": [...]}
    """
    
    def decorator(func: Callable):
        cache = SmartCache(default_ttl=ttl)
        priority_enum = Priority[priority.upper()]
        
        async def wrapper(*args, **kwargs):
            # Get request from args or kwargs
            request: Optional[Request] = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            
            if request is None:
                request = kwargs.get("request")
            
            # Skip condition
            if skip and request and skip(request):
                return await func(*args, **kwargs)
            
            # Generate cache key
            if key_generator and request:
                cache_key = key_generator(request)
            else:
                cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Try cache
            cached = cache.get(cache_key)
            if cached:
                return cached
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Cache result (if dict)
            if isinstance(result, dict):
                cache.set(cache_key, result, ttl=ttl, priority=priority_enum)
            
            return result
        
        return wrapper
    
    return decorator


def create_cache_router(
    ttl: int = 300,
    priority: str = "medium",
) -> Dict[str, Any]:
    """
    Create a cache router for manual control
    
    Usage:
        cache_router = create_cache_router()
        
        @app.get("/products")
        async def get_products():
            cached = cache_router["cache"].get("products")
            if cached:
                return cached
            
            data = await get_products_from_db()
            cache_router["cache"].set("products", data)
            return data
    """
    
    cache = SmartCache(default_ttl=ttl)
    priority_enum = Priority[priority.upper()]
    
    return {
        "cache": cache,
        "priority": priority_enum,
        "ttl": ttl,
    }


def _generate_cache_key(request: Request) -> str:
    """Generate cache key from request"""
    method = request.method
    path = request.url.path
    query = str(request.query_params)
    
    key_string = f"{method}:{path}:{query}"
    hash_value = hashlib.md5(key_string.encode()).hexdigest()
    
    return f"{method}:{path}:{hash_value}"
