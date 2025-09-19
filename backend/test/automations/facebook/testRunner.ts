import { getTestIds } from "./helpers/getTestIds";
import { testSelectors } from "./selectorTester";
// Adicione outros imports de testes que você tenha aqui

async function main() {
  try {
    console.log("🔄 Buscando IDs e URL automaticamente...");
    const { userId, accountId, maxPosts: defaultMaxPosts } = (await getTestIds()) || {};

    if (!userId || !accountId) {
      console.error("❌ Não foi possível obter IDs de teste. Verifique a configuração.");
      process.exit(1);
    }

    const maxPosts = defaultMaxPosts || 2000;

    console.log("\n🧪 INICIANDO BATERIA DE TESTES");
    console.log("================================");
    console.log(`Usuario: ${userId}`);
    console.log(`Conta: ${accountId}`);
    console.log(`Max Posts: ${maxPosts}`);
    
    const flags = process.argv.slice(2);
    const headless = flags.includes("--headless");
    console.log(`Testes: ${flags.join(", ") || 'todos'}`);

    if (flags.includes("--only-selectors")) {
      console.log("\n🎯 TESTE DE SELETORES");
      console.log("----------------------");
      
      const groupUrls = [
        "https://www.facebook.com/groups/940840924057399",


      ];
      
      const specificGroup = process.argv.find(arg => arg.startsWith("http"));
      const urlsToProcess = specificGroup ? [specificGroup] : groupUrls;

      console.log(`\n🚀 Iniciando processamento SIMULTÂNEO para ${urlsToProcess.length} grupos.`);

      const tasks = urlsToProcess.map(url => {
          console.log(`   -> Agendando tarefa para: ${url}`);
          return testSelectors({
              userId,
              accountId,
              groupUrl: url,
              headless: headless,
              maxPosts: maxPosts,
              saveToJson: true,
          });
      });

      await Promise.all(tasks);

      console.log("\n\n✅ Processamento simultâneo de todos os grupos foi finalizado.");
      console.log("✅ Teste de seletores concluído");
      return;
    }

    // Se você tiver outros testes, a lógica para executá-los iria aqui

    console.log("\n📊 RELATÓRIO FINAL");
    console.log("==================");
    console.log("✅ TODOS OS TESTES FORAM CONCLUÍDOS");

  } catch (error) {
    console.error("\n💥 Erro fatal no Test Runner:", error);
    process.exit(1);
  }
}

main();