const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const REGIAO = "southamerica-east1";

// Função auxiliar para calcular o ciclo de arquivamento
function calcularCicloVibracoes(dataBase) {
    const agora = new Date(dataBase);
    const proximaQuinta = new Date(agora);
    proximaQuinta.setUTCHours(proximaQuinta.getUTCHours() - 3); // Ajuste para fuso de Brasília
    
    const diaDaSemana = proximaQuinta.getDay();
    let diasAteProximaQuinta = (4 - diaDaSemana + 7) % 7;
    
    // Se hoje é quinta e o trabalho já passou, pega a próxima quinta
    if (diasAteProximaQuinta === 0 && (agora.getHours() > 19 || (agora.getHours() === 19 && agora.getMinutes() > 20))) {
        diasAteProximaQuinta = 7;
    }

    proximaQuinta.setDate(proximaQuinta.getDate() + diasAteProximaQuinta);
    proximaQuinta.setHours(19, 20, 0, 0);

    // A data de arquivamento é 21 dias após a primeira vibração
    const dataArquivamento = new Date(proximaQuinta);
    dataArquivamento.setDate(dataArquivamento.getDate() + 21);

    return {
        dataArquivamento: admin.firestore.Timestamp.fromDate(dataArquivamento)
    };
}

// Robô 1: Arquiva os pedidos concluídos. Roda 22:30 de toda Quinta.
exports.arquivarVibracoesConcluidas = functions.region(REGIAO).pubsub
    .schedule('30 22 * * 4').timeZone('America/Sao_Paulo')
    .onRun(async (context) => {
        console.log("Iniciando arquivamento de vibrações concluídas.");
        const agora = admin.firestore.Timestamp.now();
        const colecoes = ['encarnados', 'desencarnados'];
        let totalArquivado = 0;

        for (const nomeColecao of colecoes) {
            const colecaoRef = db.collection(nomeColecao);
            const historicoRef = db.collection('historico_vibracoes');
            const snapshot = await colecaoRef.where('dataArquivamento', '<=', agora).get();
            
            if (snapshot.empty) continue;

            const batch = db.batch();
            snapshot.forEach(doc => {
                const dadosParaHistorico = { ...doc.data(), tipo: nomeColecao.slice(0, -1), arquivadoEm: agora };
                batch.set(historicoRef.doc(), dadosParaHistorico);
                batch.delete(doc.ref);
            });

            await batch.commit();
            totalArquivado += snapshot.size;
        }
        console.log(`Arquivamento concluído. Total: ${totalArquivado} docs.`);
        return null;
    });

// Robô 2: Ativa os pedidos pendentes. Roda 22:31 de toda Quinta.
exports.ativarNovosPedidos = functions.region(REGIAO).pubsub
    .schedule('31 22 * * 4').timeZone('America/Sao_Paulo')
    .onRun(async (context) => {
        console.log("Iniciando ativação de novos pedidos.");
        const colecoes = ['encarnados', 'desencarnados'];
        const promises = [];
        for (const colecao of colecoes) {
            const q = db.collection(colecao).where('status', '==', 'pendente');
            const snapshotPromise = q.get().then(snapshot => {
                if (snapshot.empty) return;
                const batch = db.batch();
                snapshot.forEach(doc => {
                    batch.update(doc.ref, { status: 'ativo' });
                });
                return batch.commit();
            });
            promises.push(snapshotPromise);
        }
        await Promise.all(promises);
        console.log("Ativação de pedidos pendentes concluída.");
        return null;
    });

// Função chamada pelo Frontend para enviar um pedido
exports.enviarPedidoVibracao = functions.region(REGIAO).https.onCall(async (data, context) => {
    const { nome, endereco, tipo } = data;
    if (!nome || !tipo) {
        throw new functions.https.HttpsError('invalid-argument', 'Dados do pedido incompletos.');
    }

    const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const diaDaSemana = agoraSP.getDay();
    const horas = agoraSP.getHours();
    const minutos = agoraSP.getMinutes();
    
    let statusFinal = 'ativo';
    // Se for quinta-feira durante ou um pouco antes/depois do trabalho, o status é 'pendente'
    if (diaDaSemana === 4 && ((horas === 19 && minutos >= 21) || (horas > 19 && horas < 22) || (horas === 22 && minutos <= 30))) {
        statusFinal = 'pendente';
    }
    
    const { dataArquivamento } = calcularCicloVibracoes(agoraSP);
    
    // --- CORREÇÃO AQUI ---
    // Verifica se o tipo é exatamente uma das coleções válidas (no plural).
    // Se não for, usa 'desencarnados' como padrão de segurança.
    const colecaoAlvo = (tipo === 'encarnados' || tipo === 'desencarnados') ? tipo : 'desencarnados';

    const dadosParaSalvar = {
        nome: nome.trim(),
        dataPedido: admin.firestore.FieldValue.serverTimestamp(),
        status: statusFinal,
        dataArquivamento: dataArquivamento
    };

    // Apenas adiciona o endereço se for para encarnados
    if (colecaoAlvo === 'encarnados' && endereco) {
        dadosParaSalvar.endereco = endereco.trim();
    }

    try {
        await db.collection(colecaoAlvo).add(dadosParaSalvar);
        return { success: true, message: `Pedido enviado! Status: ${statusFinal}.` };
    } catch (error) {
        console.error("Erro ao salvar pedido de vibração:", error);
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro ao salvar o pedido.');
    }
});

// --- NOVA FUNÇÃO DE ESTATÍSTICAS ---
exports.calcularEstatisticasDiarias = functions.region(REGIAO).pubsub
    .schedule('every day 03:00').timeZone('America/Sao_Paulo')
    .onRun(async (context) => {
        console.log("Iniciando cálculo diário de estatísticas.");

        const colecoes = ['encarnados', 'desencarnados'];
        let totalAtivos = 0;
        let totalPedidosHoje = 0;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0); // Início do dia de hoje
        const timestampHoje = admin.firestore.Timestamp.fromDate(hoje);

        // Calcula total de ativos e pedidos de hoje
        for (const colecao of colecoes) {
            const ativosSnapshot = await db.collection(colecao).where('status', '==', 'ativo').get();
            totalAtivos += ativosSnapshot.size;

            const hojeSnapshot = await db.collection(colecao).where('dataPedido', '>=', timestampHoje).get();
            totalPedidosHoje += hojeSnapshot.size;
        }

        // Calcula pedidos por mês (últimos 6 meses)
        const pedidosPorMes = [];
        const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        for (let i = 5; i >= 0; i--) {
            const data = new Date();
            data.setMonth(data.getMonth() - i);
            const mesNome = mesesNomes[data.getMonth()];
            const ano = data.getFullYear();
            
            const inicioMes = new Date(ano, data.getMonth(), 1);
            const fimMes = new Date(ano, data.getMonth() + 1, 0, 23, 59, 59);

            let totalMes = 0;
            for (const colecao of colecoes) {
                 const mesSnapshot = await db.collection(colecao)
                    .where('dataPedido', '>=', inicioMes)
                    .where('dataPedido', '<=', fimMes)
                    .get();
                totalMes += mesSnapshot.size;
            }
            pedidosPorMes.push({ mes: `${mesNome}/${ano}`, total: totalMes });
        }

        const statsData = {
            totalAtivos: totalAtivos,
            pedidosHoje: totalPedidosHoje,
            pedidosPorMes: pedidosPorMes,
            ultimaAtualizacao: admin.firestore.FieldValue.serverTimestamp()
        };

        // Salva o resumo em um único documento
        await db.collection('estatisticas').doc('resumo').set(statsData);
        console.log("Estatísticas diárias salvas com sucesso.", statsData);
        return null;
    });