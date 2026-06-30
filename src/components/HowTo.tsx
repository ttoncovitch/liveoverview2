import React from 'react';
import { ArrowLeft, HelpCircle, Filter, FileSpreadsheet, LayoutDashboard, Target, Users, AlertTriangle, Calendar, FileText, Upload, Download, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';

interface HowToProps {
  onBack?: () => void;
}

export function HowTo({ onBack }: HowToProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full flex-1 min-h-0 overflow-y-auto custom-scrollbar max-w-4xl mx-auto py-8 px-4"
    >
      <motion.div variants={item} className="flex items-center gap-4 mb-8">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Button>
        )}
        <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center shadow-inner">
          <HelpCircle className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">How to?</h2>
        </div>
      </motion.div>

      <div className="space-y-6">
        
        {/* Etapas de Upload */}
        <motion.div variants={item} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-black text-slate-800">1. Os Arquivos Necessários (Uploads)</h3>
          </div>
          <div className="text-slate-600 space-y-4 leading-relaxed text-sm">
            <p>
              O sistema precisa de 3 arquivos para construir um Overview completo. É obrigatório fazer o upload na ordem certa:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                <div className="flex items-center gap-2 font-black text-blue-800 mb-2">
                  <Users size={16} /> Staff Info
                </div>
                <p className="text-xs text-blue-900/70">
                  Responsável por mapear <strong>quem é quem</strong>. Ele associa e-mails a Nomes, <strong>LOB, Idioma e Team Leader</strong>. Sem ele, a ferramenta não sabe separar as hierarquias.
                </p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                <div className="flex items-center gap-2 font-black text-emerald-800 mb-2">
                  <Calendar size={16} /> Calendário
                </div>
                <p className="text-xs text-emerald-900/70">
                  Responsável por trazer os <strong>turnos escalados e ausências</strong>. Aqui as faltas, férias (PTO) ou se alguém logou fora do horário são descobertos, e os atrasos e early leaves se baseiam nisso.
                </p>
              </div>
              <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl">
                <div className="flex items-center gap-2 font-black text-purple-800 mb-2">
                  <FileText size={16} /> Extract Byteworks
                </div>
                <p className="text-xs text-purple-900/70">
                  O extrato em tempo real tirado na aba "Calibration" do BW. Traz todos os cliques e pausas do dia. Assim que upado, finaliza a sincronização e exibe os dados.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Overview e Status */}
        <motion.div variants={item} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-100 p-2 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="text-lg font-black text-slate-800">2. Abas e Overview</h3>
          </div>
          <div className="text-slate-600 space-y-4 leading-relaxed text-sm">
            <p>
              Após processar os dados, você é redirecionado para o <strong>Overview</strong>. Nessa aba principal, os dados do momento (Real-Time) ou do dia aparecem em formatos de cards.
            </p>
            <ul className="list-none space-y-3">
               <li className="flex gap-3">
                  <div className="mt-1"><span className="w-2 h-2 rounded-full bg-slate-300 block"></span></div>
                  <div><strong>Métricas Iniciais e Totais:</strong> Você confere total de agentes, os impactos gerais de overbreak no floor, médias de turno, e um Top 10 com quem abusou de pausas nos status Organic (banheiro) e IDLE (ocio).</div>
               </li>
               <li className="flex gap-3">
                  <div className="mt-1"><span className="w-2 h-2 rounded-full bg-indigo-400 block"></span></div>
                  <div><strong>Abas e LOBs:</strong> Pelos menus da interface você entra na visão de agentes detalhada, cruza relatórios por desempenho de grupos de negócio (LOB Analytics) ou vê métricas e comparecimentos de times no Staff details.</div>
               </li>
            </ul>
          </div>
        </motion.div>

        {/* Entendendo Pausas e Overbreaks */}
        <motion.div variants={item} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-rose-100 p-2 rounded-lg">
              <Clock className="w-5 h-5 text-rose-600" />
            </div>
            <h3 className="text-lg font-black text-slate-800">3. A lógica por trás das Pausas, Atrasos e Limites</h3>
          </div>
          <div className="text-slate-600 space-y-4 leading-relaxed text-sm">
            <p>Como a ferramenta calcula o que é de direito vs O que é quebra do planejamento?</p>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div className="border border-slate-200 rounded-lg p-3">
                   <h4 className="font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded inline-block mb-1 text-[10px] uppercase tracking-widest">Tempos Preditivos Permitidos</h4>
                   <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-500">
                     <li><strong>Meal (Almoço/Jantar):</strong> 60m.</li>
                     <li><strong>Short:</strong> 2 breaks / 15min cada ou 1 de 30min (sob autorização).</li>
                     <li><strong>Wellness/Praying:</strong> 15m.</li>
                     <li><strong>Organic (Banheiro):</strong> 10m.</li>
                   </ul>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                   <h4 className="font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded inline-block mb-1 text-[10px] uppercase tracking-widest">Tardiness / Atrasos / Idle</h4>
                   <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-500">
                     <li><strong>Tardiness:</strong> Cruzado pelos minutos de diferença onde não houve o Registro no Byteworks vs inicio de turno do calendário.</li>
                     <li><strong>Early Leave:</strong> Agentes que terminaram final de escala mais cedo.</li>
                     <li><strong>Idle:</strong> Tempo em ócio sem justificação (não somado no overbreak).</li>
                   </ul>
                </div>
             </div>
             <p className="mt-2 text-xs opacity-80">Qualquer minuto excedido nos Tempos Permitidos, se converte em Overbreak Geral em vermelho para o Agente.</p>
          </div>
        </motion.div>

        {/* Filtros Inteligentes e Exportação */}
        <motion.div variants={item} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-teal-100 p-2 rounded-lg">
              <Filter className="w-5 h-5 text-teal-600" />
            </div>
            <h3 className="text-lg font-black text-slate-800">4. Alertas, Botões e Filtros Rápidos</h3>
          </div>
          <div className="text-slate-600 space-y-4 leading-relaxed text-sm">
             <p>Use os botões pequenos dispostos na interface para cruzar os dados, ou clique neles juntos para anular listagens perfeitas.</p>
             <div className="flex flex-wrap gap-2 mt-4 text-[10px] uppercase tracking-widest font-black">
                 <span className="bg-slate-200 text-slate-600 px-2 py-1 rounded">2 min ou menos</span>
                 <span className="bg-red-500 text-white px-2 py-1 rounded">IDLE</span>
                 <span className="bg-amber-500 text-white px-2 py-1 rounded">Organic</span>
                 <span className="bg-orange-500 text-white px-2 py-1 rounded">Tardiness</span>
                 <span className="bg-rose-500 text-white px-2 py-1 rounded">Absences</span>
                 <span className="bg-amber-100 text-amber-600 border border-amber-300 px-2 py-1 rounded">Check</span>
             </div>
             <ul className="list-disc pl-5 space-y-2 mt-4 text-slate-600">
                 <li><strong className="text-slate-800">2 min ou menos:</strong> Isola os pequenos ruídos de desvios em pausas ou tempo do sistema, trazendo apenas a sujeira de break grossa que pesa na aderência.</li>
                 <li><strong className="text-slate-800">Check:</strong> Ele avisa sobre incongruências grandes, como logs em dias de folgas e ausência de login durante o turno.</li>
                 <li><strong className="text-slate-800">Filtros Combinados:</strong> Se clicar em "Tardiness" e depois em "09:00 - 18:00", verá apenas os atrasos do turno da manhã.</li>
             </ul>
          </div>
        </motion.div>

        {/* Support Staff */}
        <motion.div variants={item} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-orange-100 p-2 rounded-lg">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="text-lg font-black text-slate-800">5. Support Staff e Mapeamento de Times</h3>
          </div>
          <div className="text-slate-600 space-y-4 leading-relaxed text-sm">
             <p>A aba de <strong>Staff details</strong> permite visualizar a cobertura do time de suporte ao longo do dia, cruzando as presenças com os times operacionais que eles gerenciam.</p>
              <ul className="list-disc pl-5 mt-2 space-y-2 text-slate-600">
               <li><strong className="text-slate-800">Botão Details:</strong> Clique no botão de detalhes no final da linha do supervisor para abrir a janela "Support Staff in Charge", revelando exatamente os agentes pertencentes a ele e comparando as estatísticas em tempo real, lado-a-lado.</li>
               <li><strong className="text-slate-800">Cobertura de Turno:</strong> Os horários no calendário ajudam a identificar se existem buracos de liderança em determinados momentos-chave do schedule diário.</li>
             </ul>
          </div>
        </motion.div>

        {/* Exportação */}
        <motion.div variants={item} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <Download className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="text-lg font-black text-slate-800">6. Gerando Reportes (Exportação em PDF)</h3>
          </div>
          <div className="text-slate-600 space-y-4 leading-relaxed text-sm">
             <p>A ferramenta permite baixar dossiês em formato corporativo (landscape) de toda a calibragem processada.</p>
             <p className="p-3 bg-emerald-50 text-emerald-900/80 rounded-lg border border-emerald-100">
                Pressione os filtros que deseja expor, certifique-se das linhas e botões clicados. Apenas dados passados pelo filtro serão compilados em tela ao Exportar PDF. A nomeação oficial sai de forma predefinida ex: <code className="bg-white px-1 py-0.5 border border-emerald-200 text-xs font-bold rounded">Report_Filtros_Data.pdf</code>.
             </p>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}

