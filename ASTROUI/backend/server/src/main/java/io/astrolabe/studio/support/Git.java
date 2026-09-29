package io.astrolabe.studio.support;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Read-only git access (§30.5): an argv allowlist, `--no-optional-locks`, `GIT_OPTIONAL_LOCKS=0`, a deadline and an
 * output cap. The Studio never runs a git command that writes refs, the index, the stash or the working tree (R-CHG-01).
 */
public final class Git {
    private static final Set<String> ALLOWED = Set.of("rev-parse", "log", "show", "diff", "for-each-ref", "cat-file", "ls-files", "status", "version", "symbolic-ref");
    private static final int CAP = 8 * 1024 * 1024;

    public record Result(int exit, String out, boolean truncated) {
        public boolean ok() { return exit == 0; }
    }

    private Git() { }

    public static Result run(Path repo, long timeoutSeconds, String... args) {
        if (args.length == 0 || !ALLOWED.contains(args[0])) throw new IllegalArgumentException("git " + (args.length == 0 ? "" : args[0]) + " is not on the read-only allowlist");
        List<String> argv = new ArrayList<>();
        argv.add("git");
        argv.add("--no-optional-locks");
        argv.add("-c");
        argv.add("core.quotepath=off");
        argv.addAll(List.of(args));
        ProcessBuilder pb = new ProcessBuilder(argv).redirectErrorStream(true);
        if (repo != null) pb.directory(repo.toFile());
        pb.environment().put("GIT_OPTIONAL_LOCKS", "0");
        pb.environment().put("GIT_TERMINAL_PROMPT", "0");
        pb.environment().put("LC_ALL", "C");
        try {
            Process process = pb.start();
            process.getOutputStream().close();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            boolean truncated = false;
            try (InputStream in = process.getInputStream()) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (out.size() + n > CAP) {
                        out.write(buf, 0, Math.max(0, CAP - out.size()));
                        truncated = true;
                        break;
                    }
                    out.write(buf, 0, n);
                }
            }
            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return new Result(-1, "git " + args[0] + " exceeded its deadline", true);
            }
            if (truncated) process.destroyForcibly();
            return new Result(process.exitValue(), out.toString(StandardCharsets.UTF_8), truncated);
        } catch (IOException e) {
            return new Result(-1, "git unavailable: " + e.getMessage(), false);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result(-1, "interrupted", false);
        }
    }

    public static Result run(Path repo, String... args) { return run(repo, 30, args); }
}
