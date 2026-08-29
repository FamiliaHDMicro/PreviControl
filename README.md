# PreviControl / PrevConsulta

Sistema de triagem preliminar de direitos previdenciários desenvolvido no modelo **Terminal Burro (Single File)** para execução de **custo zero** no Cloudflare Workers.

## 🚀 Tecnologias Utilizadas

* **Cloudflare Workers:** Execução serverless do HTML e rotas de API.
* **Tailwind CSS:** Estilização via CDN.
* **JavaScript (ES6+):** Lógica de triagem e persistência no navegador/banco.
* **WhatsApp API (wa.me):** Integração nativa e gratuita para envio de relatórios aos atendentes.

## ⚙️ Arquitetura do Sistema

* **Terminal Burro / Landing Page:** Interface leve que roda direto na nuvem sem necessidade de armazenamento local pesado no dispositivo do cliente.
* **Painel de Controle:** Área restrita para gestão de leads e configurações de atendimento.
* **Custo Zero:** Funciona 100% dentro do plano gratuito da Cloudflare e sem custos de API externa da Meta.

## 📁 Estrutura de Arquivos

* `index.js` — Código-fonte principal com renderização de HTML, lógica de triagem e rotas de API.
* `wrangler.jsonc` — Configuração de deploy da Cloudflare.
* `README.md` — Documentação do projeto.
