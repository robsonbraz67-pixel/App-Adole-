import { LICAO_JOV_1, LICAO_JOV_2, LICAO_JOV_3 } from "./dataJov1";
import { LICAO_JOV_4, LICAO_JOV_5, LICAO_JOV_6 } from "./dataJov2";
import { LICAO_JOV_7, LICAO_JOV_8, LICAO_JOV_9 } from "./dataJov3";
import { LICAO_JOV_10, LICAO_JOV_11 } from "./dataJov4";
import { LICAO_JOV_12, LICAO_JOV_13 } from "./dataJov5";

// Trilha "Jovem" (youngAdult): temporada "O dom de profecia", 4º tri de 2026.
// Mesmo tema e mesmas semanas da trilha de adultos, em formato de jovens. Fica
// numa trilha PRÓPRIA — não na de adolescentes — porque as datas (26/09 a
// 25/12) são as mesmas da temporada "Livro Aberto" dos adolescentes, e duas
// lições com a mesma semana na mesma trilha disputam o mesmo documento de
// progresso (`uid_semana`). O scripts/check-licoes.mjs barra data ou semana
// repetida dentro de uma trilha.
const LICOES_YOUNG = [
  LICAO_JOV_1, LICAO_JOV_2, LICAO_JOV_3, LICAO_JOV_4, LICAO_JOV_5, LICAO_JOV_6,
  LICAO_JOV_7, LICAO_JOV_8, LICAO_JOV_9, LICAO_JOV_10, LICAO_JOV_11, LICAO_JOV_12,
  LICAO_JOV_13
];

export default LICOES_YOUNG;
