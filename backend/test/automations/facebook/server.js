
const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Serve a interface web
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'web-interface.html'));
});

// Endpoint para executar comandos de teste
app.post('/api/run-test', (req, res) => {
    const { command, env = {} } = req.body;
    
    console.log('🚀 Executando comando:', command);
    
    res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    
    const process = spawn(command[0], command.slice(1), {
        cwd: __dirname,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    process.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('STDOUT:', text);
        res.write(text);
    });
    
    process.stderr.on('data', (data) => {
        const text = data.toString();
        console.log('STDERR:', text);
        res.write(text);
    });
    
    process.on('close', (code) => {
        console.log(`✅ Processo finalizado com código: ${code}`);
        res.write(`\n\n🏁 Processo finalizado (código: ${code})\n`);
        res.end();
    });
    
    process.on('error', (error) => {
        console.error('❌ Erro no processo:', error);
        res.write(`\n\n💥 Erro: ${error.message}\n`);
        res.end();
    });
});

// Endpoint para listar contas
app.get('/api/accounts', async (req, res) => {
    try {
        const process = spawn('npx', ['tsx', 'testRunner.ts', '--list-accounts'], {
            cwd: __dirname
        });
        
        let output = '';
        
        process.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        process.on('close', (code) => {
            res.json({ success: code === 0, output });
        });
        
        process.on('error', (error) => {
            res.status(500).json({ success: false, error: error.message });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🌐 Interface de Testes do Facebook iniciada!
📍 URL: http://localhost:${PORT}
    
🧪 Funcionalidades:
• Interface web amigável para todos os testes
• Execução em tempo real com logs
• Seleção fácil de contas
• Configuração visual de parâmetros
• Atalhos de teclado para agilidade

💡 Como usar:
1. Acesse http://localhost:${PORT}
2. Configure os parâmetros
3. Clique nos botões para executar testes
4. Acompanhe os logs em tempo real
    `);
});
