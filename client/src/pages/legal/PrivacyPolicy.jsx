import LegalShell, { LegalSection, CONTACT_EMAIL } from './LegalShell'

// Política de Privacidade pública. Cobre LGPD/GDPR e — importante para a
// verificação do Google — a divulgação explícita do uso de dados do Google
// (escopo drive.file) e a cláusula de "Uso Limitado".
export default function PrivacyPolicy() {
  return (
    <LegalShell title="Política de Privacidade">
      <p>
        Esta Política de Privacidade descreve como o <strong>Noctis Studio</strong> ("nós", "plataforma") coleta, usa,
        armazena e protege os seus dados quando você usa o site e os serviços disponíveis em noctis-studio.online.
        Ao usar a plataforma, você concorda com as práticas descritas aqui.
      </p>

      <LegalSection title="1. Quem somos e como falar conosco">
        <p>
          O Noctis Studio é uma ferramenta de gestão e pesquisa para criadores de conteúdo. O responsável pelo
          tratamento dos dados pode ser contatado pelo e-mail <a className="text-cyan-400" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Dados que coletamos">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Cadastro:</strong> nome e e-mail usados para criar e acessar sua conta.</li>
          <li><strong>Conteúdo do seu workspace:</strong> canais, vídeos, roteiros, referências, quadros, desenhos e demais dados que você cria na plataforma.</li>
          <li><strong>Chaves de API (BYOK):</strong> quando você conecta suas próprias chaves (YouTube, IA, etc.), elas são usadas apenas para executar as ações que você solicita.</li>
          <li><strong>Dados do Google (Drive):</strong> se você conectar o Google Drive, solicitamos o acesso mínimo necessário (ver seção 4).</li>
          <li><strong>Dados técnicos:</strong> informações básicas de uso e do navegador, necessárias para operar e proteger o serviço.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Como usamos os dados">
        <ul className="list-disc space-y-1 pl-5">
          <li>Fornecer, manter e melhorar as funcionalidades da plataforma.</li>
          <li>Autenticar seu acesso e sincronizar seu conteúdo entre dispositivos.</li>
          <li>Garantir segurança, prevenir abuso e cumprir obrigações legais.</li>
        </ul>
        <p>Não vendemos seus dados pessoais e não os usamos para publicidade de terceiros.</p>
      </LegalSection>

      <LegalSection title="4. Uso de dados do Google (Google Drive)">
        <p>
          A funcionalidade de desenhos pode, se você autorizar, usar o escopo
          <strong> Google Drive API (.../auth/drive.file)</strong>. Esse escopo dá ao aplicativo acesso
          <strong> exclusivamente aos arquivos que o próprio Noctis Studio cria</strong> no seu Drive (os seus projetos de
          desenho e suas imagens). <strong>Não acessamos, lemos nem listamos</strong> quaisquer outros arquivos do seu Google Drive.
        </p>
        <p>
          Para permitir que você e as pessoas a quem você libera acesso abram esses projetos de dentro do site, guardamos
          um token de atualização (refresh token) do Google de forma <strong>criptografada</strong> nos nossos servidores. Ele é usado
          somente para salvar e carregar os seus projetos de desenho quando você (ou um colaborador autorizado por você) o solicita.
        </p>
        <p className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-slate-400">
          <strong>Uso Limitado (Limited Use):</strong> o uso das informações recebidas das APIs do Google pelo Noctis Studio
          adere à <a className="text-cyan-400" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Política de Dados do Usuário dos Serviços de API do Google</a>,
          incluindo os requisitos de Uso Limitado. Não usamos os dados do Google para treinar modelos de IA, não os
          transferimos a terceiros exceto para operar o serviço a seu pedido ou por exigência legal, e não os usamos para
          publicidade.
        </p>
        <p>Você pode revogar esse acesso a qualquer momento, desconectando o Drive na plataforma ou em <a className="text-cyan-400" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</p>
      </LegalSection>

      <LegalSection title="5. Serviços de terceiros">
        <p>Para operar, a plataforma utiliza provedores que podem processar dados em nosso nome:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Supabase</strong> — banco de dados, autenticação e armazenamento.</li>
          <li><strong>Vercel</strong> — hospedagem da aplicação.</li>
          <li><strong>Google</strong> — login e, se autorizado, Google Drive.</li>
          <li>APIs que você conecta com suas próprias chaves (ex.: YouTube, provedores de IA), regidas pelos termos de cada uma.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Armazenamento, segurança e retenção">
        <p>
          Adotamos medidas técnicas razoáveis para proteger seus dados, incluindo criptografia de tokens sensíveis e
          controle de acesso. Mantemos seus dados enquanto sua conta estiver ativa. Você pode solicitar a exclusão a
          qualquer momento (seção 7).
        </p>
      </LegalSection>

      <LegalSection title="7. Seus direitos (LGPD / GDPR)">
        <p>
          Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e, quando aplicável, do GDPR, você tem direito a
          acessar, corrigir, exportar e excluir seus dados, além de revogar consentimentos. Para exercer esses direitos,
          escreva para <a className="text-cyan-400" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="8. Cookies e armazenamento local">
        <p>
          Usamos armazenamento local do navegador (localStorage/IndexedDB) para manter sua sessão e um cache do seu conteúdo,
          o que é essencial para o funcionamento da plataforma. Não usamos cookies de rastreamento publicitário.
        </p>
      </LegalSection>

      <LegalSection title="9. Menores">
        <p>A plataforma não é destinada a menores de 18 anos e não coletamos intencionalmente dados de crianças e adolescentes.</p>
      </LegalSection>

      <LegalSection title="10. Alterações nesta política">
        <p>
          Podemos atualizar esta política periodicamente. Mudanças relevantes serão indicadas pela data de "última
          atualização" no topo desta página.
        </p>
      </LegalSection>

      <p className="text-xs text-slate-600">
        Este documento é fornecido a título informativo e não constitui aconselhamento jurídico. Recomenda-se revisão por um
        profissional para adequação ao seu caso específico.
      </p>
    </LegalShell>
  )
}
