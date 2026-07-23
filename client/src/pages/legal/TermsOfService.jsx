import LegalShell, { LegalSection, CONTACT_EMAIL } from './LegalShell'

// Termos de Serviço públicos.
export default function TermsOfService() {
  return (
    <LegalShell title="Termos de Serviço">
      <p>
        Estes Termos de Serviço ("Termos") regem o uso do <strong>Noctis Studio</strong> ("plataforma", "serviço").
        Ao criar uma conta ou usar o serviço, você concorda com estes Termos. Se não concordar, não use a plataforma.
      </p>

      <LegalSection title="1. O serviço">
        <p>
          O Noctis Studio é uma ferramenta de gestão e pesquisa de conteúdo, incluindo organização de canais, roteiros,
          referências, quadros de ideias e desenhos. O serviço pode evoluir, com recursos adicionados ou modificados ao longo do tempo.
        </p>
      </LegalSection>

      <LegalSection title="2. Conta e responsabilidades">
        <ul className="list-disc space-y-1 pl-5">
          <li>Você é responsável por manter a confidencialidade das suas credenciais e por toda atividade na sua conta.</li>
          <li>Você declara ter capacidade legal e ao menos 18 anos para usar o serviço.</li>
          <li>As informações fornecidas no cadastro devem ser verdadeiras e atualizadas.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Uso aceitável">
        <p>Você concorda em não utilizar a plataforma para:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Atividades ilegais ou que violem direitos de terceiros (incluindo direitos autorais).</li>
          <li>Enviar conteúdo malicioso, ou tentar comprometer a segurança do serviço.</li>
          <li>Violar os termos de serviços de terceiros integrados (ex.: Google, YouTube).</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Seu conteúdo">
        <p>
          Você mantém a titularidade do conteúdo que cria ou envia (textos, imagens, desenhos). Você nos concede apenas a
          licença limitada e necessária para armazenar, processar e exibir esse conteúdo com o fim de operar o serviço para você
          e para as pessoas a quem você conceder acesso. Você é o único responsável pelo conteúdo que produz e compartilha.
        </p>
      </LegalSection>

      <LegalSection title="5. Serviços de terceiros e chaves próprias (BYOK)">
        <p>
          Alguns recursos dependem de serviços de terceiros e de chaves de API que você conecta. O uso desses serviços está
          sujeito aos termos e limites de cada provedor, e você é responsável por respeitá-los e pelos custos que gerar.
        </p>
      </LegalSection>

      <LegalSection title="6. Propriedade intelectual">
        <p>
          A plataforma, sua marca, código e design são protegidos e permanecem de titularidade do Noctis Studio. Estes Termos
          não transferem a você nenhum direito sobre a plataforma além do uso autorizado.
        </p>
      </LegalSection>

      <LegalSection title="7. Isenções e limitação de responsabilidade">
        <p>
          O serviço é fornecido "no estado em que se encontra", sem garantias de disponibilidade ininterrupta ou ausência de
          erros. Na máxima extensão permitida por lei, o Noctis Studio não se responsabiliza por danos indiretos, perda de
          dados ou lucros cessantes decorrentes do uso ou da impossibilidade de uso do serviço. Recomendamos que você mantenha
          backups do seu conteúdo importante.
        </p>
      </LegalSection>

      <LegalSection title="8. Suspensão e encerramento">
        <p>
          Podemos suspender ou encerrar contas que violem estes Termos. Você pode encerrar sua conta a qualquer momento; após a
          exclusão, seus dados são removidos conforme a Política de Privacidade.
        </p>
      </LegalSection>

      <LegalSection title="9. Alterações">
        <p>
          Podemos atualizar estes Termos periodicamente. O uso continuado após mudanças relevantes implica concordância com a
          versão atualizada.
        </p>
      </LegalSection>

      <LegalSection title="10. Legislação aplicável">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil, elegendo-se o foro do domicílio do usuário
          para dirimir controvérsias, quando aplicável.
        </p>
      </LegalSection>

      <LegalSection title="11. Contato">
        <p>Dúvidas sobre estes Termos: <a className="text-cyan-400" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </LegalSection>

      <p className="text-xs text-slate-600">
        Este documento é fornecido a título informativo e não constitui aconselhamento jurídico.
      </p>
    </LegalShell>
  )
}
