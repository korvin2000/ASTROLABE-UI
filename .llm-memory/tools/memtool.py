#!/usr/bin/env python3
"""Freshness fingerprints for the .llm-memory cards.

Each card lists the paths it summarizes under `## Freshness` as lines `- `path``.
`stamp` records their fingerprints in manifest.tsv; `check` reports entries whose
content changed, disappeared, or were never stamped. See ../MAINTAIN.md.
"""
import hashlib
import os
import re
import sys

MEM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(MEM)
MANIFEST = os.path.join(MEM, "manifest.tsv")
CARD_DIRS = [MEM, os.path.join(MEM, "cards")]
SKIP_DIRS = {".git", "build", "node_modules", ".gradle", ".angular", ".kotlin", "dist", "out",
             ".idea", "__pycache__", ".cache", "coverage"}
HEADER = "card\tpath\tkind\tbytes\tfingerprint"
PATH_LINE = re.compile(r"^\s*-\s+`([^`]+)`")


def blob_hash(path):
    with open(path, "rb") as f:
        data = f.read()
    h = hashlib.sha1(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()[:12], len(data)


def dir_hash(path):
    entries, total = [], 0
    for base, dirs, files in os.walk(path):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            full = os.path.join(base, name)
            fp, size = blob_hash(full)
            total += size
            entries.append(f"{os.path.relpath(full, path).replace(os.sep, '/')}\t{fp}")
    digest = hashlib.sha1("\n".join(entries).encode()).hexdigest()[:12]
    return digest, total, len(entries)


def fingerprint(rel):
    full = os.path.join(ROOT, rel.rstrip("/"))
    if os.path.isdir(full):
        fp, size, _ = dir_hash(full)
        return "dir", size, fp
    if os.path.isfile(full):
        fp, size = blob_hash(full)
        return "file", size, fp
    return "missing", 0, "-"


def cards():
    found = {}
    for d in CARD_DIRS:
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            path = os.path.join(d, name)
            if name.endswith(".md") and is_card(path):
                found[name[:-3]] = path
    return found


def is_card(path):
    with open(path, encoding="utf-8") as f:
        return f.readline().strip() == "---" and f.readline().startswith("card:")


def card_paths(card_file):
    paths, inside = [], False
    with open(card_file, encoding="utf-8") as f:
        for line in f:
            if line.startswith("## "):
                inside = line.strip().lower() == "## freshness"
                continue
            if inside:
                m = PATH_LINE.match(line)
                if m:
                    paths.append(m.group(1).strip())
    return paths


def load_manifest():
    rows = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            for line in f.read().splitlines()[1:]:
                if line.strip():
                    card, path, kind, size, fp = line.split("\t")
                    rows[(card, path)] = (kind, int(size), fp)
    return rows


def save_manifest(rows):
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        f.write(HEADER + "\n")
        for (card, path), (kind, size, fp) in sorted(rows.items()):
            f.write(f"{card}\t{path}\t{kind}\t{size}\t{fp}\n")


def selected(args):
    all_cards = cards()
    if not args or args == ["--all"]:
        return all_cards
    unknown = [a for a in args if a not in all_cards]
    if unknown:
        sys.exit(f"unknown card(s): {', '.join(unknown)}; known: {', '.join(all_cards)}")
    return {a: all_cards[a] for a in args}


def stamp(args):
    if not args:
        sys.exit("stamp needs <card>... or --all")
    rows = load_manifest()
    for card, file in selected(args).items():
        rows = {k: v for k, v in rows.items() if k[0] != card}
        for path in card_paths(file):
            kind, size, fp = fingerprint(path)
            rows[(card, path)] = (kind, size, fp)
            if kind == "missing":
                print(f"warning: {card}: {path} does not exist")
    save_manifest(rows)
    print(f"stamped {len(rows)} entries")


def check(args):
    rows, problems = load_manifest(), 0
    for card, file in selected(args).items():
        for path in card_paths(file):
            old = rows.get((card, path))
            kind, size, fp = fingerprint(path)
            if kind == "missing":
                status = "MISSING"
            elif old is None:
                status = "UNSTAMPED"
            elif old[2] != fp:
                status = f"CHANGED ({old[1]} -> {size} bytes)"
            else:
                continue
            problems += 1
            print(f"{card}\t{path}\t{status}")
    print(f"{problems} stale entr{'y' if problems == 1 else 'ies'}" if problems else "all fresh")
    return 1 if problems else 0


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("check", "stamp"):
        sys.exit("usage: memtool.py check [card...] | stamp <card...|--all>")
    cmd, args = sys.argv[1], sys.argv[2:]
    sys.exit(check(args) if cmd == "check" else stamp(args))


if __name__ == "__main__":
    main()
