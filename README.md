# Rota — Controle para Entregadores

Aplicativo web (PWA) para entregadores de moto controlarem ganhos, gastos, lucro real por quilômetro, entregas por recorte no odômetro, manutenção de óleo, vencimentos de documentos e relatórios mensais, com funcionamento offline e armazenamento local no aparelho.

## Como rodar localmente

```bash
npm install
npm run dev
```

O servidor de desenvolvimento inicia na porta `3000`.

## Build, lint e testes

```bash
npm run lint   # Verificação de tipos TypeScript (tsc --noEmit)
npm run test   # Executa os testes unitários com Vitest
npm run build  # Gera o build de produção + Service Worker PWA em dist/
```

## Chaves do `localStorage` (`rota_*_v1`)

Todos os dados ficam salvos localmente no navegador/aparelho:

- `rota_lancamentos_v1`: Lista JSON com os lançamentos financeiros de ganhos e gastos registrados pelo usuário.
- `rota_trajetos_v1`: Histórico JSON de trajetos rodados (via GPS ou inseridos manualmente) em quilômetros.
- `rota_entregas_v1`: Histórico JSON dos recortes individuais de entrega medidos pelo odômetro.
- `rota_entrega_atual_v1`: Estado da entrega em andamento no odômetro para retomada após recarregar ou fechar o app (com leitura de fallback da chave legada `rota_odometro_entrega_ativa_v1`).
- `rota_odometro_km_v1`: Quilometragem acumulada na rota atualmente em andamento no odômetro.
- `rota_odometro_segundos_v1`: Tempo decorrido em segundos da rota atualmente em andamento no odômetro.
- `rota_meta_diaria_v1`: Valor em reais da meta diária de lucro definida nos ajustes.
- `rota_ultimo_km_painel_v1`: Última leitura de odômetro do painel da moto salva para cálculo de quilometragem manual.
- `rota_config_oleo_v1`: Configuração da troca de óleo (intervalo em km, quilometragem base e data da última troca).
- `rota_percentual_reserva_v1`: Percentual padrão usado em cálculos herdados de reserva.
- `rota_tema_v1`: Preferência de tema visual (`auto`, `claro` ou `escuro`).
- `rota_contraste_v1`: Preferência do modo de alto contraste (`normal` ou `high`).
- `rota_min_lucro_km_v1`: Valor mínimo desejado de lucro por km para destaque visual no resumo.
- `rota_modo_movimento_v1`: Preferência do modo de exibição simplificado durante o deslocamento.
- `rota_reserva_km_v1`: Valor reservado por quilômetro rodado para desgaste e manutenção da moto.
- `rota_reserva_mes_v1`: Valor mensal reservado para custos fixos como IPVA, seguro ou MEI.
- `rota_vencimentos_v1`: Lista JSON de documentos e vencimentos cadastrados com data para alertas.

## Backup e restauração

Em **Histórico > Ajustes > Dados e compartilhamento**:

- **Salvar** / **Compartilhar backup**: exporta um arquivo `.json` (`versao: 1`) contendo lançamentos, trajetos, entregas, vencimentos e configurações. Também é possível exportar uma planilha em **CSV**.
- **Restaurar**: valida o arquivo `.json` selecionado e exibe uma tela de confirmação com o resumo de lançamentos, trajetos e entregas encontrados antes de substituir os dados, permitindo cancelar ou baixar um backup dos dados atuais antes de confirmar. Backups antigos sem os novos campos continuam sendo restaurados sem apagar as configurações extras atuais.

## Observação sobre `rota-android/`

A pasta `rota-android/` contém uma versão nativa antiga do aplicativo e não inclui as funcionalidades mais recentes do app web (como recorte de entregas no odômetro, reservas, vencimentos e confirmação de backup). A pasta `android/` na raiz é o wrapper Capacitor do app web atual.
