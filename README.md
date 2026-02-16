## *Resumo do Funcionamento*

O projeto consiste em um sistema embarcado de navegação, baseado no ESP32-S3, que recebe comandos via BLE (Bluetooth Low Energy) de um aplicativo móvel, exibe informações de navegação em um display OLED e, adicionalmente.

---![WhatsApp Image 2026-02-16 at 19 23 57](https://github.com/user-attachments/assets/6b18339c-76f9-4838-9386-edd987183866)


## *Componentes Principais*

### *1. ESP32-S3*
- Microcontrolador central do sistema.
- Responsável por:
  - Receber comandos de navegação via BLE do app.
  - Exibir setas, ícones e textos no display OLED (SSD1309) usando a biblioteca U8g2.
  - Captar áudio do microfone INMP441 via interface I2S.
  - Conectar-se à rede Wi-Fi para enviar áudio ao servidor Flask.
  - Receber e exibir respostas da IA.

### *2. Display OLED*
- Exibe informações de navegação (setas, texto, status Bluetooth).
- Utiliza bitmaps para ícones e setas, além de textos dinâmicos.


### *3. Aplicativo Móvel*
- Desenvolvido em React/TypeScript.
- Permite ao usuário enviar comandos de navegação via BLE.
- Possui botão para acionar a IA (comando para ESP32 iniciar gravação de áudio).


---

## *Fluxo de Funcionamento*

1. *Navegação Tradicional*
   - Usuário envia comandos de direção pelo app (BLE).
   - ESP32-S3 recebe, interpreta e exibe setas/textos no display OLED.


---

## *Detalhes Técnicos*

### *Servidor Flask*
- Endpoint /ask recebe arquivo de áudio via POST.
- Usa Whisper CLI para transcrição automática do áudio.
- Integra com Ollama via API REST para geração de resposta.
- Retorna resposta em formato JSON.

### *Whisper*
- Modelo de reconhecimento de voz (Speech-to-Text).
- Executado via linha de comando no servidor.
- Suporta múltiplos idiomas, incluindo português.

### *Ollama*
- Plataforma para rodar modelos de linguagem grandes (LLMs) localmente.
- Recebe texto via API REST e retorna respostas geradas por IA.
- Utiliza modelos como Llama3, Mistral, etc.

### *Comunicação*
- ESP32-S3 se conecta ao Wi-Fi e faz requisições HTTP ao servidor Flask.
- BLE é usado para comunicação entre app e ESP32.
- App pode ser testado em qualquer dispositivo móvel com BLE.

---

## *Testes e Simulações*
- O sistema pode ser testado sem o microfone, simulando o envio de áudio ou texto fixo.
- O endpoint do servidor pode ser testado com ferramentas como Postman ou curl.
- O display OLED mostra tanto informações de navegação quanto respostas da IA.

---

## *Diferenciais do Projeto*
- Integração de navegação tradicional com interação por voz baseada em IA.
- Uso de modelos de IA locais, garantindo privacidade e independência de nuvem.
- Arquitetura modular, permitindo expansão para outros sensores ou funcionalidades.
- Interface amigável via app móvel.

---

## *Possíveis Melhorias Futuras*
- Implementação de HTTPS para maior segurança.
- Otimização do buffer de áudio para melhor desempenho no ESP32.
- Adição de feedback visual/sonoro no app.
- Suporte a comandos de voz para navegação.

---

## *Conclusão*
O projeto demonstra uma solução embarcada inovadora, unindo navegação assistida e inteligência artificial, com comunicação BLE, Wi-Fi e integração de APIs modernas. O sistema é funcional, expansível e pode ser adaptado para diversas aplicações em acessibilidade, automação ou orientação inteligente.
