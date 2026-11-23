# Rota — Projeto Android Studio (APK Nativo via Capacitor)

Esta pasta (`android/`) contém o projeto completo do **Rota** pronto para abrir no **Android Studio** e gerar o **APK nativo** com **100% da interface e das funções atuais** (temas claro/escuro/alto contraste, Hoje/Resumo/Histórico/Ajustes, Odômetro com Recorte por entrega, Reservas, Vencimentos, Relatório mensal, Backup e CSV).

## Passo a passo para gerar o APK no Android Studio

1. **Baixe ou clone o repositório** no seu computador.
2. No terminal, na pasta raiz do projeto (onde fica o `package.json`), rode uma vez:
   ```bash
   npm install
   npm run android:sync
   ```
   *(Isso garante que as dependências em `node_modules/@capacitor/android` e os arquivos compilados em `dist/` estejam sincronizados com a pasta `android/`.)*
3. Abra o **Android Studio** e clique em **Open** (ou **File → Open**).
4. Selecione a pasta **`android`** (dentro da raiz do projeto — **não** a pasta raiz inteira, e **não** a antiga `rota-android`).
5. Aguarde o **Gradle Sync** terminar na barra inferior.
6. Para gerar o APK instalável:
   - Menu superior: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
   - Quando terminar, clique em **locate** no aviso do canto inferior direito para abrir a pasta do arquivo **`app-debug.apk`**.
   - Ou plugue seu celular via **cabo USB** (com **Depuração USB** ativada) e clique em **Run (▶)** para instalar direto no aparelho.

## Sempre que alterar o app no futuro

Na raiz do projeto, execute:
```bash
npm run android:sync
```
Depois gere o APK novamente no Android Studio.
