import json
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rpa"))

from extrair_clientes import extract_clients, parse_brl  # noqa: E402


class ScraperTests(unittest.TestCase):
    def test_parse_saldo_brl(self):
        self.assertEqual(parse_brl("R$ 12.500,00"), 12500.0)
        self.assertEqual(parse_brl("R$ 850,00"), 850.0)

    def test_extracts_all_demo_clients(self):
        html = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        clients = extract_clients(html)
        self.assertEqual(len(clients), 10)
        self.assertEqual(clients[0]["nome"], "Ana Silva")
        self.assertEqual(clients[0]["perfil"], "Conservador")
        self.assertEqual(set(clients[0]), {"nome", "email", "saldo", "perfil"})

    def test_rejects_missing_table(self):
        with self.assertRaisesRegex(ValueError, "Tabela"):
            extract_clients("<html><body>sem tabela</body></html>")


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.workflow = json.loads(
            (ROOT / "n8n" / "workflow.json").read_text(encoding="utf-8")
        )
        self.nodes = {node["name"]: node for node in self.workflow["nodes"]}
        self.connections = self.workflow["connections"]

    def test_workflow_routes_items_through_llm_and_postprocessor(self):
        self.assertEqual(
            self.connections["Code - Montar mensagens"]["main"][0][0]["node"],
            "code normalizar para llm",
        )
        self.assertEqual(
            self.connections["code normalizar para llm"]["main"][0][0]["node"],
            "Basic LLM Chain",
        )
        self.assertEqual(
            self.connections["Basic LLM Chain"]["main"][0][0]["node"],
            "Code - Normalizar saída LLM",
        )
        self.assertEqual(
            self.connections["Code - Normalizar saída LLM"]["main"][0][0]["node"],
            "Responder ao RPA1",
        )
        self.assertTrue(
            any(
                edge["node"] == "Basic LLM Chain"
                for group in self.connections["Groq Chat Model"]["ai_languageModel"]
                for edge in group
            )
        )
        self.assertFalse(self.workflow["active"])

    def test_llm_prompt_is_dynamic_and_processes_the_item(self):
        node = self.nodes["Basic LLM Chain"]["parameters"]
        self.assertEqual(node["text"], "={{ $json.promptLLM }}")
        self.assertEqual(self.nodes["Groq Chat Model"]["parameters"]["model"], "allam-2-7b")

    def test_pre_llm_node_emits_one_prompt_per_email(self):
        node = self.nodes["code normalizar para llm"]
        source = (ROOT / "n8n" / "code-normalizar-llm.js").read_text(encoding="utf-8")
        self.assertEqual(node["parameters"]["mode"], "runOnceForAllItems")
        self.assertEqual(node["parameters"]["jsCode"], source)
        self.assertIn("return registros.map(registro =>", source)
        self.assertIn("email_valido", source)
        self.assertIn("promptLLM", source)

    def test_post_llm_code_restores_email_and_aggregates_results(self):
        node = self.nodes["Code - Normalizar saída LLM"]
        source = (ROOT / "n8n" / "code-normalizar-resposta-llm.js").read_text(encoding="utf-8")
        self.assertEqual(node["parameters"]["mode"], "runOnceForAllItems")
        self.assertEqual(node["parameters"]["jsCode"], source)
        self.assertIn("$('code normalizar para llm').all()", source)
        self.assertIn("mensagem_llm", source)
        self.assertIn("resultados", source)


if __name__ == "__main__":
    unittest.main()
