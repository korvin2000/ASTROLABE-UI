package io.astrolabe.studio.fs;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import io.astrolabe.studio.changes.LandingService;
import io.astrolabe.studio.projects.ProjectService;
import io.astrolabe.studio.support.ApiException;
import io.astrolabe.studio.support.Json;
import io.astrolabe.studio.support.StudioError;

import org.springframework.stereotype.Service;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The folder dialog (Studio 2 §5, BE-13). A browser cannot give an absolute path, so the backend lists folders:
 * sub-folders only, a git mark on repositories, no file names and no file contents. Served to the local session only.
 */
@Service
public class FolderService {
    private static final int MAX = 500;

    private final ProjectService projects;

    public FolderService(ProjectService projects) { this.projects = projects; }

    /** `GET /fs/folders?path=`: the folder, its parents and its sub-folders; without a path, the home folder. */
    public ObjectNode list(String raw) {
        ObjectNode o = Json.obj();
        ArrayNode roots = o.putArray("roots");
        for (Path r : FileSystems.getDefault().getRootDirectories()) roots.add(r.toString());
        Path home = Path.of(System.getProperty("user.home"));
        o.put("home", home.toString());
        Path folder;
        try {
            folder = raw == null || raw.isBlank() ? home : Path.of(unquote(raw.strip())).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            throw StudioError.of(StudioError.PROJECT_NOT_FOUND, Json.obj().put("path", raw), "not a path: " + raw);
        }
        if (!Files.isDirectory(folder)) throw StudioError.of(StudioError.PROJECT_NOT_FOUND, Json.obj().put("path", folder.toString()), "not a folder: " + folder);
        o.put("path", folder.toString());
        o.put("name", folder.getFileName() == null ? folder.toString() : folder.getFileName().toString());
        o.put("git", isRepository(folder));
        o.put("insideGit", !isRepository(folder) && insideRepository(folder));
        if (folder.getParent() != null) o.put("parent", folder.getParent().toString());
        ArrayNode crumbs = o.putArray("breadcrumb");
        List<Path> chain = new ArrayList<>();
        for (Path p = folder; p != null; p = p.getParent()) chain.addFirst(p);
        for (Path p : chain) crumbs.addObject().put("name", p.getFileName() == null ? p.toString() : p.getFileName().toString()).put("path", p.toString());
        List<Path> children = new ArrayList<>();
        boolean more = false;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(folder, Files::isDirectory)) {
            for (Path child : stream) {
                String name = child.getFileName().toString();
                if (name.startsWith(".") || name.startsWith("$") || hidden(child)) continue;
                if (children.size() >= MAX) {
                    more = true;
                    break;
                }
                children.add(child);
            }
        } catch (IOException | SecurityException e) {
            o.put("unreadable", true);
        }
        children.sort(Comparator.comparing(p -> p.getFileName().toString().toLowerCase()));
        ArrayNode folders = o.putArray("folders");
        for (Path child : children) folders.addObject().put("name", child.getFileName().toString()).put("path", child.toString()).put("git", isRepository(child));
        o.put("more", more);
        ArrayNode recent = o.putArray("recent");
        for (var row : projects.rows()) if (!row.demo()) recent.addObject().put("name", row.name()).put("path", row.path());
        return o;
    }

    private static String unquote(String s) {
        return s.length() > 1 && s.startsWith("\"") && s.endsWith("\"") ? s.substring(1, s.length() - 1) : s;
    }

    private static boolean hidden(Path p) {
        try {
            return Files.isHidden(p);
        } catch (IOException e) {
            return false;
        }
    }

    private static boolean isRepository(Path folder) { return Files.exists(folder.resolve(".git")); }

    private static boolean insideRepository(Path folder) {
        for (Path p = folder.getParent(); p != null; p = p.getParent()) if (Files.exists(p.resolve(".git"))) return true;
        return false;
    }

    /** `POST /fs/git-init`: `{ path }` — the one question of §5 UX-8 answered with "Initialise git". */
    public ObjectNode gitInit(String raw) {
        if (raw == null || raw.isBlank()) throw ApiException.invalid("a folder is required");
        Path folder = Path.of(unquote(raw.strip())).toAbsolutePath().normalize();
        if (!Files.isDirectory(folder)) throw StudioError.of(StudioError.PROJECT_NOT_FOUND, Json.obj().put("path", folder.toString()), "not a folder: " + folder);
        if (isRepository(folder)) return Json.obj().put("path", folder.toString()).put("git", true).put("created", false);
        if (insideRepository(folder)) throw ApiException.invalid("this folder is inside another git repository; open that repository instead");
        LandingService.init(folder);
        return Json.obj().put("path", folder.toString()).put("git", true).put("created", true);
    }

    /** `POST /projects`: `{ path }` — adds the folder; a folder that is not a repository is E-8 with its one action. */
    public ObjectNode addProject(String raw) {
        if (raw == null || raw.isBlank()) throw ApiException.invalid("a folder is required");
        Path folder;
        try {
            folder = Path.of(unquote(raw.strip())).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            throw StudioError.of(StudioError.PROJECT_NOT_FOUND, Json.obj().put("path", raw), "not a path: " + raw);
        }
        ObjectNode params = Json.obj().put("path", folder.toString());
        if (!Files.isDirectory(folder)) throw StudioError.of(StudioError.PROJECT_NOT_FOUND, params, "not a folder: " + folder);
        if (!isRepository(folder)) {
            if (insideRepository(folder)) {
                Path root = folder;
                while (root != null && !Files.exists(root.resolve(".git"))) root = root.getParent();
                params.put("root", String.valueOf(root));
                throw new StudioError("inside_repository", 409, params, "the folder is inside the repository " + root, false);
            }
            throw StudioError.of(StudioError.NOT_A_GIT_REPO, params, "not a git repository: " + folder);
        }
        try {
            var row = projects.add(folder.toString(), false);
            projects.open(row.id());
            return projects.dto(projects.require(row.id()));
        } catch (ApiException e) {
            throw StudioError.from(e, params);
        }
    }
}
