package io.astrolabe.studio.bridge.fixture

import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

/**
 * Fixture repositories for fixture mode (§24.3): small real git repositories owned by the Studio's data directory,
 * never a user's repository. Each declares a test suite ASTROLABE sniffs (`python -m unittest discover -s tests`).
 */
public object FixtureRepos {
    public const val DEMO_SHOP: String = "demo-shop"

    /** The request the demo scenario answers (the scripted model follows it; any text is accepted). */
    public const val DEMO_REQUEST: String =
        "Fix apply_discount in src/shop/pricing.py: treat the discount as a percentage and never return a negative total. Keep cart_total's signature unchanged."

    internal const val PRICING_PATH = "src/shop/pricing.py"
    internal const val TESTS_PATH = "tests/test_pricing.py"
    internal const val README_PATH = "README.md"

    internal const val BUGGY_BODY = "    return total - percent\n"
    internal const val FIXED_BODY = "    discounted = total * (1 - percent / 100)\n    return max(discounted, 0)\n"
    internal const val FIXED_BODY_ROUNDED = "    discounted = total * (1 - percent / 100)\n    return round(max(discounted, 0), 2)\n"

    /** The interactive demo: the scripted model asks a question and needs one D-class approval. */
    public const val DEMO_INTERACTIVE_REQUEST: String =
        "Fix apply_discount in src/shop/pricing.py so discounts are percentages and totals never go negative. Ask me how totals should be rounded, and check CI workflows under .github before editing."

    private val files: Map<String, String> = linkedMapOf(
        "pyproject.toml" to """
            [project]
            name = "demo-shop"
            version = "0.1.0"
            description = "A tiny shop used by ASTROLABE Studio fixture mode"
            requires-python = ">=3.9"
        """.trimIndent() + "\n",
        README_PATH to """
            # demo-shop

            A tiny pricing module used by ASTROLABE Studio's fixture mode.

            Run the tests with `python -m unittest discover -s tests`.
        """.trimIndent() + "\n",
        "src/shop/__init__.py" to "\"\"\"demo-shop pricing package.\"\"\"\n",
        PRICING_PATH to """
            ""${'"'}Cart pricing for demo-shop.""${'"'}


            def apply_discount(total, percent):
                ""${'"'}Return the total after a percentage discount.""${'"'}
            ${BUGGY_BODY.trimEnd()}


            def cart_total(items, percent=0):
                ""${'"'}Sum (price, quantity) pairs and apply the discount.""${'"'}
                subtotal = sum(price * quantity for price, quantity in items)
                return apply_discount(subtotal, percent)
        """.trimIndent() + "\n",
        "src/shop/catalog.py" to """
            ""${'"'}Product catalog lookups.""${'"'}

            PRODUCTS = {
                "tea": 4.5,
                "coffee": 6.0,
                "cake": 3.25,
            }


            def price_of(name):
                return PRODUCTS[name]
        """.trimIndent() + "\n",
        TESTS_PATH to """
            import os
            import sys
            import unittest

            sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

            from shop.pricing import apply_discount, cart_total  # noqa: E402


            class PricingTest(unittest.TestCase):
                def test_percentage_discount(self):
                    self.assertAlmostEqual(apply_discount(200, 10), 180)

                def test_never_negative(self):
                    self.assertEqual(apply_discount(10, 150), 0)

                def test_cart_total(self):
                    self.assertAlmostEqual(cart_total([(10, 2), (5, 4)], 25), 30)


            if __name__ == "__main__":
                unittest.main()
        """.trimIndent() + "\n",
        "tests/test_catalog.py" to """
            import os
            import sys
            import unittest

            sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

            from shop.catalog import price_of  # noqa: E402


            class CatalogTest(unittest.TestCase):
                def test_known_product(self):
                    self.assertEqual(price_of("tea"), 4.5)


            if __name__ == "__main__":
                unittest.main()
        """.trimIndent() + "\n",
        ".gitignore" to "__pycache__/\n*.pyc\n",
    )

    /**
     * Creates the demo repository under [parent], or with [reset] restores its files to the fixture content in place.
     * The repository (and so ASTROLABE's repository identity, its state root and every earlier campaign's shadow refs)
     * is kept; the initial commit is deterministic, so a recreated repository has the same identity too.
     */
    @JvmStatic
    @JvmOverloads
    public fun demoShop(parent: Path, reset: Boolean = false): Path {
        val root = parent.resolve(DEMO_SHOP)
        if (Files.isDirectory(root.resolve(".git"))) {
            if (reset) {
                writeFiles(root)
                root.resolve("src/shop/__pycache__").toFile().deleteRecursively()
                root.resolve("tests/__pycache__").toFile().deleteRecursively()
            }
            return root
        }
        Files.createDirectories(root)
        writeFiles(root)
        git(root, "init", "-q")
        git(root, "add", "-A")
        git(root, "-c", "user.name=ASTROLABE Studio", "-c", "user.email=studio@astrolabe.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "demo-shop: initial import")
        return root
    }

    private fun writeFiles(root: Path) {
        files.forEach { (path, text) ->
            val file = root.resolve(path)
            Files.createDirectories(file.parent)
            Files.writeString(file, text)
        }
    }

    private fun git(root: Path, vararg args: String) {
        val builder = ProcessBuilder(listOf("git") + args).directory(root.toFile()).redirectErrorStream(true)
        // A fixed date and identity make the initial commit, and so the repository identity, deterministic.
        builder.environment()["GIT_AUTHOR_DATE"] = "2026-01-01T00:00:00Z"
        builder.environment()["GIT_COMMITTER_DATE"] = "2026-01-01T00:00:00Z"
        val process = builder.start()
        val output = process.inputStream.readAllBytes().toString(Charsets.UTF_8)
        check(process.waitFor(60, TimeUnit.SECONDS)) { "git ${args.joinToString(" ")} timed out" }
        check(process.exitValue() == 0) { "git ${args.joinToString(" ")} failed: $output" }
    }

}
