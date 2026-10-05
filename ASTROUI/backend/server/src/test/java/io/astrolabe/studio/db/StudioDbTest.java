package io.astrolabe.studio.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/** studio.db migrations: a database of an older Studio upgrades in place, and a migration lands whole or not at all. */
class StudioDbTest {
    @TempDir
    Path dir;

    @Test
    void aDatabaseBeforeW5UpgradesAndKeepsItsDecisions() {
        var ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("studio.db"), true);
        try {
            JdbcTemplate db = new JdbcTemplate(ds);
            int before = StudioDb.MIGRATIONS.size() - 1;
            db.execute("CREATE TABLE schema_version (version INTEGER NOT NULL, applied_at TEXT NOT NULL)");
            for (int i = 0; i < before; i++) {
                for (String sql : StudioDb.MIGRATIONS.get(i)) db.execute(sql);
                db.update("INSERT INTO schema_version (version, applied_at) VALUES (?, 'x')", i + 1);
            }
            db.update("INSERT INTO acceptance_decision (request_id, work_id, candidate, contract_revision, kind, text, by_authority, created_at) VALUES ('r-1','W-1','\"c\"',2,'accept','ok','user:local','t')");
            StudioDb.migrate(db);
            StudioDb.migrate(db);   // a second start finds nothing to do
            assertEquals(StudioDb.MIGRATIONS.size(), db.queryForObject("SELECT max(version) FROM schema_version", Integer.class));
            assertEquals(1, db.queryForObject("SELECT count(*) FROM acceptance_decision WHERE request_id = 'r-1' AND decision_key IS NULL AND attempt_id IS NULL", Integer.class));
            assertEquals(0, db.queryForObject("SELECT count(*) FROM acceptance_note", Integer.class));
        } finally {
            ds.destroy();
        }
    }

    @Test
    void sqliteRollsBackDdlWithItsTransactionAsEachMigrationRelies() {
        var ds = new SingleConnectionDataSource("jdbc:sqlite:" + dir.resolve("partial.db"), true);
        try {
            JdbcTemplate db = new JdbcTemplate(ds);
            StudioDb.migrate(db);
            // What StudioDb.apply relies on: statements of one transaction that fails later leave nothing, DDL included.
            db.execute("CREATE TABLE probe (a INTEGER)");
            var con = org.springframework.jdbc.datasource.DataSourceUtils.getConnection(ds);
            assertThrows(java.sql.SQLException.class, () -> {
                con.setAutoCommit(false);
                try (var s = con.createStatement()) {
                    s.execute("ALTER TABLE probe ADD COLUMN b TEXT");
                    s.execute("ALTER TABLE decision ADD COLUMN note TEXT");   // exists: fails
                    con.commit();
                } catch (java.sql.SQLException e) {
                    con.rollback();
                    throw e;
                } finally {
                    con.setAutoCommit(true);
                }
            });
            assertEquals(0, db.queryForObject("SELECT count(*) FROM pragma_table_info('probe') WHERE name = 'b'", Integer.class), "SQLite rolls DDL back with its transaction");
        } finally {
            ds.destroy();
        }
    }
}
