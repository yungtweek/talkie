# Database lifecycle

- `DatabaseModule` owns the `DATABASE_POOL` lifecycle (create/close).
- Modules that inject `DATABASE_POOL` must not call `pool.end()` or `db.destroy()`.
- Modules that create their own pool must manage and close it on shutdown.
