# DeepLearning.AI PT-BR Captions

Extensão para o Chrome que traduz automaticamente as legendas dos cursos de [DeepLearning.AI](https://learn.deeplearning.ai) para **português do Brasil**.

---

## Funcionalidades

- Tradução automática das legendas de inglês para português brasileiro
- Funciona em navegação SPA
- Cache de traduções — frases repetidas aparecem instantaneamente
- Tradução sob demanda para legendas não pré-carregadas
- Leve e sem dependências externas

---

## Instalação

A extensão ainda não está publicada na Chrome Web Store. Para instalar manualmente:

1. Faça o download ou clone este repositório
2. Abra o Chrome e acesse `chrome://extensions`
3. Ative o **Modo do desenvolvedor** (canto superior direito)
4. Clique em **Carregar sem compactação**
5. Selecione a pasta da extensão.

A extensão será ativada automaticamente ao acessar `learn.deeplearning.ai`.

---

## Estrutura

```
deeplearning-ptbr-extension/
├── manifest.json   # Configuração da extensão (Manifest V3)
├── content.js      # Script principal injetado nas páginas
├── popup.html      # Popup ao clicar no ícone da extensão
├── icons           # Diretório de ícones
└── README.md
```

---

## Permissões utilizadas

| Permissão | Motivo |
|---|---|
| `learn.deeplearning.ai/*` | Traduzir legendas dos vídeos da plataforma |
| `translate.googleapis.com/*` | Realizar as requisições de tradução |

Nenhum dado é coletado ou enviado além das requisições à API do Google Translate.

---

## Limitações

- Depende do endpoint público do Google Translate — pode ser bloqueado em redes corporativas ou ter limite de requisições
- Funciona apenas em `learn.deeplearning.ai`
- Legendas em outros idiomas além do inglês não são suportadas

