package io.astrolabe.studio.db;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import javax.sql.DataSource;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import io.astrolabe.studio.StudioProperties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * `studio.db` (§26.1): the Studio's own SQLite database — event log, decisions, commands, settings, providers,
 * profiles, audit. ASTROLABE's stores are separate and read-only for the Studio. Versioned migrations are applied in
 * order and recorded in `schema_version` (a minimal Flyway equivalent, recorded in docs/decisions.md).
 */
@Configuration
public class StudioDb {
    private static final Logger log = LoggerFactory.getLogger(StudioDb.class);

    public static final List<List<String>> MIGRATIONS = List.of(
        List.of(
            "CREATE TABLE project (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, " +
                "state_root TEXT, repo_identity TEXT, added_at TEXT NOT NULL, opened_at TEXT, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE campaign_index (work_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, custom_title TEXT, status TEXT NOT NULL, " +
                "phase TEXT, outcome TEXT, reason TEXT, shape TEXT, mode TEXT, fingerprint TEXT, demo INTEGER NOT NULL DEFAULT 0, parent_work TEXT, " +
                "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_seq INTEGER NOT NULL DEFAULT 0, last_journal_seq INTEGER NOT NULL DEFAULT 0, " +
                "pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, options_json TEXT)",
            "CREATE INDEX campaign_index_by_project ON campaign_index (project_id, updated_at)",
            "CREATE TABLE event_log (work_id TEXT NOT NULL, seq INTEGER NOT NULL, at TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, " +
                "cell TEXT, turn INTEGER, payload TEXT NOT NULL, PRIMARY KEY (work_id, seq))",
            "CREATE TABLE gap (work_id TEXT NOT NULL, from_seq INTEGER NOT NULL, at TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (work_id, from_seq))",
            "CREATE TABLE decision (id TEXT PRIMARY KEY, kind TEXT NOT NULL, project_id TEXT, work_id TEXT, cell_id TEXT, contract_revision INTEGER, " +
                "request_json TEXT NOT NULL, status TEXT NOT NULL, reply_json TEXT, by_authority TEXT, reason TEXT, created_at TEXT NOT NULL, " +
                "answered_at TEXT, lease_expires_at TEXT)",
            "CREATE INDEX decision_by_status ON decision (status, created_at)",
            "CREATE TABLE command (id TEXT PRIMARY KEY, name TEXT NOT NULL, payload_hash TEXT NOT NULL, status TEXT NOT NULL, result_json TEXT, " +
                "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
            "CREATE TABLE settings_layer (scope TEXT PRIMARY KEY, revision INTEGER NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL)",
            "CREATE TABLE settings_history (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, revision INTEGER NOT NULL, json TEXT NOT NULL, " +
                "summary TEXT, at TEXT NOT NULL)",
            "CREATE TABLE profile (id TEXT PRIMARY KEY, json TEXT NOT NULL, state TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, " +
                "qualification_json TEXT, updated_at TEXT NOT NULL)",
            "CREATE TABLE provider_config (id TEXT PRIMARY KEY, json TEXT NOT NULL, last_test_json TEXT, updated_at TEXT NOT NULL)",
            "CREATE TABLE llm_request (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, provider TEXT, model TEXT, invocation TEXT, " +
                "outcome TEXT, latency_ms INTEGER, first_output_ms INTEGER, attempts INTEGER, input_tokens INTEGER, output_tokens INTEGER, " +
                "cost TEXT, warnings TEXT)",
            "CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, details TEXT)",
            "CREATE TABLE notification (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, " +
                "body TEXT, target TEXT, read INTEGER NOT NULL DEFAULT 0)"
        ),
        // Studio 2: tasks (a first run and its follow-ups), their model and mode, normalised reasons, preferences.
        List.of(
            "ALTER TABLE campaign_index ADD COLUMN task_id TEXT",
            "ALTER TABLE campaign_index ADD COLUMN model_ref TEXT",
            "ALTER TABLE campaign_index ADD COLUMN effort TEXT",
            "ALTER TABLE campaign_index ADD COLUMN task_mode TEXT",
            "ALTER TABLE campaign_index ADD COLUMN verification_json TEXT",
            "ALTER TABLE campaign_index ADD COLUMN reason_json TEXT",
            "ALTER TABLE campaign_index ADD COLUMN request_text TEXT",
            "ALTER TABLE campaign_index ADD COLUMN ended_at TEXT",
            "ALTER TABLE campaign_index ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0",
            "UPDATE campaign_index SET task_id = coalesce(parent_work, work_id) WHERE task_id IS NULL",
            "CREATE INDEX campaign_index_by_task ON campaign_index (task_id, created_at)",
            "CREATE TABLE preference (key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL)"
        ),
        // Phase 0: the core's stop code of a waiting run, the user's acceptance decisions, request diagnostics (B3, B6).
        List.of(
            "ALTER TABLE campaign_index ADD COLUMN stop_code TEXT",
            "CREATE TABLE acceptance_decision (request_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, candidate TEXT NOT NULL, " +
                "contract_revision INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT, by_authority TEXT NOT NULL, created_at TEXT NOT NULL)",
            "CREATE INDEX acceptance_decision_by_work ON acceptance_decision (work_id, created_at)",
            "ALTER TABLE llm_request ADD COLUMN error_code TEXT",
            "ALTER TABLE llm_request ADD COLUMN attempts_detail TEXT",
            "ALTER TABLE llm_request ADD COLUMN tags TEXT"
        ),
        // ASTROLABE 2.0 C4: the limits and approach of each run; the token limit becomes limits in money, minutes and
        // requests — a money limit the user set is kept as is, `auto` and `tokens` take the new defaults.
        List.of(
            "ALTER TABLE campaign_index ADD COLUMN limits_json TEXT",
            "ALTER TABLE campaign_index ADD COLUMN preset TEXT",
            // A money limit above the new maximum becomes the maximum, never the default: the user sees what applies.
            "INSERT OR IGNORE INTO preference (key, json, updated_at) SELECT 'taskLimits', " +
                "json_object('moneyUsd', CASE WHEN CAST(json_extract(json, '$.value') AS REAL) > 10000 THEN '10000.00' " +
                "ELSE CAST(json_extract(json, '$.value') AS TEXT) END, 'minutes', 480, 'requests', 3000), updated_at " +
                "FROM preference WHERE key = 'limit' AND json_extract(json, '$.kind') = 'money'",
            "DELETE FROM preference WHERE key = 'limit'"
        )
    );

    @Bean(destroyMethod = "close")
    public DataSource dataSource(StudioProperties properties) throws IOException {
        Path dir = properties.dataPath();
        Files.createDirectories(dir);
        restrictToOwner(dir);
        Path db = dir.resolve("studio.db");
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:sqlite:" + db.toAbsolutePath());
        config.setMaximumPoolSize(4);
        config.setPoolName("studio-db");
        config.setConnectionInitSql("PRAGMA busy_timeout = 10000");
        config.addDataSourceProperty("journal_mode", "WAL");
        config.addDataSourceProperty("synchronous", "NORMAL");
        config.addDataSourceProperty("foreign_keys", "true");
        HikariDataSource ds = new HikariDataSource(config);
        migrate(new JdbcTemplate(ds));
        log.info("studio.db at {}", db);
        return ds;
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) { return new JdbcTemplate(dataSource); }

    @Bean
    public TransactionTemplate transactionTemplate(DataSource dataSource) {
        return new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    /** Applies the migrations to [jdbc]; public for tests over a scratch database. */
    public static void migrate(JdbcTemplate jdbc) {
        jdbc.execute("PRAGMA journal_mode = WAL");
        jdbc.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL, applied_at TEXT NOT NULL)");
        Integer current = jdbc.queryForObject("SELECT coalesce(max(version), 0) FROM schema_version", Integer.class);
        int version = current == null ? 0 : current;
        if (version > MIGRATIONS.size()) {
            throw new IllegalStateException("studio.db schema v" + version + " is newer than this Studio (v" + MIGRATIONS.size() + ")");
        }
        for (int i = version; i < MIGRATIONS.size(); i++) {
            for (String sql : MIGRATIONS.get(i)) jdbc.execute(sql);
            jdbc.update("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)", i + 1, java.time.Instant.now().toString());
        }
    }

    private static void restrictToOwner(Path dir) {
        try {
            if (Files.getFileStore(dir).supportsFileAttributeView("posix")) {
                Files.setPosixFilePermissions(dir, java.nio.file.attribute.PosixFilePermissions.fromString("rwx------"));
            }
        } catch (IOException | UnsupportedOperationException e) {
            log.debug("could not restrict {}: {}", dir, e.toString());
        }
    }
}
