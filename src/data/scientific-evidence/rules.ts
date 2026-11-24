/**
 * Rule registry: every numeric adjustment the analytics and prescription engines make, with its
 * rationale, basis (research-derived vs practical heuristic), confidence, where it is configured and
 * which verified references support it. Nothing here is personal data.
 *
 * Principles (SCIENTIFIC_METHOD.md): one transparent model — coefficient × set quality, with a
 * per-session taper. Adjustments are not stacked arbitrarily; each set credits each muscle once.
 * Where evidence is weak, a rule is an explanatory note or a heuristic, never presented as a finding.
 */
import { L, byLang } from '../../i18n/core';

export type RuleBasis = 'research' | 'research_informed_heuristic' | 'heuristic';
export type RuleArea = 'volume' | 'effort' | 'exercise' | 'session' | 'recovery' | 'progression' | 'prescription' | 'execution' | 'choice' | 'planner';

export interface Rule {
  id: string;
  area: RuleArea;
  /** What the engine does, in one sentence. */
  rule: string;
  /** Default value(s) as used by the code. */
  value: string;
  rationale: string;
  basis: RuleBasis;
  confidence: 'high' | 'moderate' | 'low';
  /** Settings path when the owner can change it, else null. */
  configurable: string | null;
  /** Ids in REFERENCES (src/data/scientific-evidence/references.ts). Empty only for heuristics. */
  refIds: string[];
  /** Source file implementing it (for audits). */
  implementedIn: string;
}

export const RULES: Rule[] = byLang(() => [
  // ---- Volume
  {
    id: 'fractional_coefficients', area: 'volume',
    rule: L('Each set credits every muscle once by a coefficient: 1 direct, 0.5 significant secondary, 0.25 minor, 0 none.', 'Каждый подход засчитывается каждой мышце один раз с коэффициентом: 1 — прямая нагрузка, 0,5 — значимая вторичная, 0,25 — небольшая, 0 — нет.'),
    value: L('1 / 0.5 / 0.25 / 0', '1 / 0,5 / 0,25 / 0'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: L('Exercise database → coefficients', 'База упражнений → коэффициенты'),
    rationale: L('Fractional counting of indirect sets predicts growth better than counting only direct sets or counting indirect sets fully; the exact coefficient per exercise is a practical estimate, not a measurement.', 'Дробный учёт косвенных подходов предсказывает рост лучше, чем учёт только прямых подходов или полный учёт косвенных; точный коэффициент для упражнения — практическая оценка, а не измерение.'),
    refIds: ['pelland2026_volume_frequency', 'gentil2015_mj_vs_sj', 'mannarino2021_curl_vs_row', 'lanza2024_bench_muscles'], implementedIn: 'src/domain/volume.ts, src/data/exercises.ts',
  },
  {
    id: 'weekly_target_reference', area: 'volume',
    rule: L('Weekly reference ≈ 10–12 effective sets per muscle (lower end 6 for large muscles); upper bounds mark diminishing returns, not harm.', 'Недельный ориентир ≈ 10–12 эффективных подходов на мышцу (нижняя граница 6 для крупных мышц); верхние границы отмечают убывающую отдачу, а не вред.'),
    value: L('preferred ≈ 10–12, min 6', 'предпочтительно ≈ 10–12, минимум 6'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: L('Muscles → target per muscle', 'Мышцы → цель для мышцы'),
    rationale: L('Dose–response with diminishing returns; a reference, not a quota. Personal baseline replaces it after Learning Mode.', 'Зависимость «доза — эффект» с убывающей отдачей; ориентир, а не норма. После режима знакомства его заменяет личный базовый уровень.'),
    refIds: ['schoenfeld2017_volume', 'pelland2026_volume_frequency', 'bazvalle2022_volume', 'currier2026_acsm_position'], implementedIn: 'src/domain/targets.ts, src/domain/muscles.ts',
  },
  {
    id: 'regional_emphasis_not_added', area: 'volume',
    rule: L('Upper/lower chest are tracked as shares of chest work and never added to the chest total.', 'Верх и низ груди учитываются как доли работы на грудные и никогда не прибавляются к общему объёму грудных.'),
    value: L('share only', 'только доля'), basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: L('Regional hypertrophy differences with bench angle are small and inconsistent; avoids double counting.', 'Региональные различия в гипертрофии при разном угле скамьи малы и непостоянны; так исключается двойной счёт.'),
    refIds: ['chaves2020_incline', 'varovic2025_muscle_length'], implementedIn: 'src/domain/registry.ts, src/domain/volume.ts',
  },
  // ---- Effort
  {
    id: 'rir_credit_table', area: 'effort',
    rule: L('Set credit by reps in reserve: 0–3 → 1.0, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥ 8 → 0.', 'Зачёт подхода по повторам в запасе: 0–3 → 1,0; 4 → 0,6; 5 → 0,3; 6–7 → 0,15; ≥ 8 → 0.'),
    value: '[1,1,1,1,0.6,0.3,0.15,0.15,0]', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: L('Settings → Set-quality model', 'Настройки → Модель качества подхода'),
    rationale: L('Hypertrophy is similar from failure to a few reps short, and declines further from failure; the exact steps beyond 3 RIR are a practical interpolation.', 'Гипертрофия сходна при работе до отказа и за несколько повторений до него и снижается по мере удаления от отказа; точные ступени после 3 RIR — практическая интерполяция.'),
    refIds: ['refalo2023_failure_meta', 'robinson2024_proximity_failure', 'refalo2024_failure_rct'], implementedIn: 'src/domain/quality.ts',
  },
  {
    id: 'failure_no_bonus', area: 'effort',
    rule: L('Reaching muscular failure earns no extra credit over 1–3 RIR; a failure answer without RIR is treated like RIR 0 (estimate). A set that ended because form broke (technical failure) is counted as compromised technique.', 'Достижение мышечного отказа не даёт дополнительного зачёта по сравнению с 1–3 RIR; ответ «отказ» без RIR считается как RIR 0 (оценка). Подход, который закончился из-за нарушения техники (отказ по технике), засчитывается как подход с нарушенной техникой.'),
    value: L('failure = RIR 0 band (credit 1.0); technical failure ×0.7', 'отказ = зона RIR 0 (зачёт 1,0); отказ по технике ×0,7'), basis: 'research', confidence: 'moderate', configurable: null,
    rationale: L('Pooled evidence does not show failure training to be superior for hypertrophy to stopping slightly short; technique breakdown changes what the target muscle was loaded with.', 'Объединённые данные не показывают, что тренировка до отказа лучше для гипертрофии, чем остановка чуть раньше; нарушение техники меняет то, какую нагрузку получила целевая мышца.'),
    refIds: ['refalo2023_failure_meta', 'refalo2024_failure_rct', 'robinson2024_proximity_failure', 'hermann2025_single_set_failure'], implementedIn: 'src/domain/quality.ts, src/domain/failure.ts',
  },
  {
    id: 'unknown_effort', area: 'effort',
    rule: L('No RIR, feel or failure answer → provisional credit 0.75 (shown as uncertain).', 'Нет RIR, ощущения и ответа об отказе → предварительный зачёт 0,75 (показан как неопределённый).'),
    value: L('0.75', '0,75'), basis: 'heuristic', confidence: 'low', configurable: L('Settings → Set-quality model', 'Настройки → Модель качества подхода'),
    rationale: L('Working sets are usually reasonably hard, but without information full credit would overstate effort.', 'Рабочие подходы обычно достаточно тяжёлые, но без информации полный зачёт завысил бы усилие.'), refIds: [], implementedIn: 'src/domain/quality.ts',
  },
  {
    id: 'feel_estimated_rir', area: 'effort',
    rule: L('Without RIR, "how did it feel" gives an estimated RIR range whose higher-RIR end goes through the RIR table; labelled an estimate.', 'Без RIR ответ «как ощущался подход» даёт оценочный диапазон RIR; его граница с большим RIR проходит через таблицу RIR; помечается как оценка.'),
    value: L('very easy 5+, easy 3–4, appropriate 1–3, hard 1–2, near max 0–1', 'очень легко 5+, легко 3–4, в самый раз 1–3, тяжело 1–2, почти максимум 0–1'), basis: 'heuristic', confidence: 'low', configurable: L('Settings → use feel when no RIR', 'Настройки → учитывать ощущение, когда нет RIR'),
    rationale: L('Self-rated effort is imprecise, especially far from failure; the conservative end avoids overstating credit.', 'Самооценка усилия неточна, особенно далеко от отказа; осторожная граница не даёт завысить зачёт.'), refIds: ['halperin2022_rir_accuracy'], implementedIn: 'src/domain/feedback.ts',
  },
  {
    id: 'compromised_technique', area: 'effort',
    rule: L('Compromised technique → ×0.7; pain → kept but flagged uncertain, never "good quality".', 'Нарушенная техника → ×0,7; боль → подход сохраняется, но помечается как неопределённый и никогда не считается «качественным».'),
    value: L('×0.7', '×0,7'), basis: 'heuristic', confidence: 'low', configurable: L('Settings → Set-quality model', 'Настройки → Модель качества подхода'),
    rationale: L('Momentum or a shortened range shifts load away from the target muscle; the size of the reduction is a judgement call.', 'Инерция или укороченная амплитуда снимают нагрузку с целевой мышцы; величина снижения — оценочное суждение.'), refIds: [], implementedIn: 'src/domain/quality.ts',
  },
  {
    id: 'drop_and_low_reps', area: 'effort',
    rule: L('Drop-set segments after the first ×0.5; sets under 5 reps ×0.8 (not timed holds).', 'Сегменты дроп-сета после первого ×0,5; подходы менее чем на 5 повторений ×0,8 (кроме удержаний на время).'),
    value: L('×0.5, ×0.8', '×0,5; ×0,8'), basis: 'research_informed_heuristic', confidence: 'low', configurable: L('Settings → Set-quality model', 'Настройки → Модель качества подхода'),
    rationale: L('Drop segments are short continuations of one set; very heavy low-rep sets give less hypertrophy per set than moderate loads at equal sets.', 'Сегменты дроп-сета — короткие продолжения одного подхода; очень тяжёлые подходы с малым числом повторений дают меньше гипертрофии на подход, чем умеренные веса при равном числе подходов.'), refIds: ['sodal2023_drop_sets', 'schoenfeld2017_load', 'lopez2021_load_network'], implementedIn: 'src/domain/quality.ts',
  },
  // ---- Exercise
  {
    id: 'rom_partials', area: 'exercise',
    rule: L('Unspecified partial reps ×0.8; lengthened partials ×1.0 (no bonus).', 'Частичные повторения без уточнения ×0,8; частичные в растянутом положении ×1,0 (без бонуса).'),
    value: L('×0.8 / ×1.0', '×0,8 / ×1,0'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: L('Settings → Set-quality model', 'Настройки → Модель качества подхода'),
    rationale: L('Training at long muscle lengths is at least as good as full range; short-length partials appear inferior.', 'Тренировка при большой длине мышцы как минимум не хуже полной амплитуды; частичные повторения при малой длине мышцы, по-видимому, уступают.'), refIds: ['pallares2021_rom', 'kassiano2023_rom_review', 'wolf2025_lengthened_partials', 'pedrosa2023_arm_curl_initial_rom', 'kassiano2023_calf_lengthened'], implementedIn: 'src/domain/quality.ts',
  },
  {
    id: 'bench_angle_groups', area: 'exercise',
    rule: L('Bench angle changes coefficients only in coarse groups (decline, flat < 10°, incline 10–45°, steep > 45°); the exact angle only separates strength histories.', 'Угол скамьи меняет коэффициенты только по грубым группам (отрицательный наклон, горизонтальная < 10°, наклон 10–45°, крутой наклон > 45°); точный угол лишь разделяет истории силы.'),
    value: L('groups', 'группы'), basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: L('Mostly EMG plus few hypertrophy trials — not enough for per-degree coefficients.', 'В основном ЭМГ и немногие исследования гипертрофии — этого недостаточно для коэффициентов на каждый градус.'), refIds: ['chaves2020_incline', 'rodriguezridao2020_bench_angles', 'lauver2016_bench_angle'], implementedIn: 'src/domain/registry.ts',
  },
  {
    id: 'supinated_vertical_pull', area: 'exercise',
    rule: L('Underhand grip on pulldowns/pull-ups → biceps coefficient at least 0.75.', 'Обратный хват в тяге верхнего блока и подтягиваниях → коэффициент бицепса не ниже 0,75.'),
    value: L('≥ 0.75', '≥ 0,75'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Elbow-flexor demand is higher with a supinated grip (biomechanics and EMG — indirect evidence).', 'При супинированном хвате нагрузка на сгибатели локтя выше (биомеханика и ЭМГ — косвенные данные).'), refIds: ['youdas2010_pullup_chinup', 'lusk2010_pulldown_grip'], implementedIn: 'src/domain/registry.ts',
  },
  {
    id: 'hip_flexion_not_abs', area: 'exercise',
    rule: L('Hanging knee raise with pelvic curl credits the abs; a pure hip-flexion leg lift would not (hip flexors are not tracked).', 'Подъём коленей в висе со скручиванием таза засчитывается прессу; чистый подъём ног за счёт сгибания бедра не засчитывался бы (сгибатели бедра не отслеживаются).'),
    value: L('abs 1 only with pelvic curl', 'пресс 1 только со скручиванием таза'), basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: L('Rectus abdominis flexes the spine/tilts the pelvis; hip flexion is done by the hip flexors. Direct hypertrophy evidence for the abs is limited.', 'Прямая мышца живота сгибает позвоночник и наклоняет таз; сгибание бедра выполняют сгибатели бедра. Прямых данных о гипертрофии пресса мало.'), refIds: ['andersson1997_abs_hipflexor_emg', 'juker1998_psoas_abwall_emg'], implementedIn: 'src/data/exercises.ts',
  },
  // ---- Session
  {
    id: 'session_taper', area: 'session',
    rule: L('Within one session, a muscle\'s effective sets above ~11 count ×0.5 (tapered, not zeroed).', 'В пределах одной тренировки эффективные подходы мышцы сверх ~11 считаются ×0,5 (плавное снижение, а не обнуление).'),
    value: L('cap 11, ×0.5', 'порог 11, ×0,5'), basis: 'heuristic', confidence: 'low', configurable: L('Settings → Set-quality model', 'Настройки → Модель качества подхода'),
    rationale: L('Per-session volume appears to show diminishing returns. The ~11-set figure comes from a 2025 preprint that has no PubMed record yet, so it is NOT in the verified library — treated as a soft heuristic (tapered, not zeroed).', 'Объём за одну тренировку, по-видимому, даёт убывающую отдачу. Цифра ~11 подходов взята из препринта 2025 года, у которого пока нет записи в PubMed, поэтому его НЕТ в проверенной библиотеке — это мягкая эвристика (плавное снижение, а не обнуление).'), refIds: [], implementedIn: 'src/domain/volume.ts',
  },
  {
    id: 'todays_share', area: 'session',
    rule: L("Today's share = remaining weekly sets ÷ sessions likely left, at most ~60 % of the weekly target (but at least 3 sets per session when that much is left, so a small target of 4–5 can exceed 60 %) and ≤ 10 per muscle; never more than what is left; leftovers carry over, never crammed.", 'Доля на сегодня = оставшиеся недельные подходы ÷ вероятное число оставшихся тренировок, не более ~60 % недельной цели (но не менее 3 подходов за тренировку, если столько осталось, поэтому небольшая цель в 4–5 может превысить 60 %) и ≤ 10 на мышцу; никогда не больше оставшегося; остаток переносится, а не добирается за один раз.'),
    value: '≤ 60 %, ≤ 10', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Spreads volume across the week (frequency matters little at equal volume, but very large single-session doses show diminishing returns).', 'Распределяет объём по неделе (частота мало значит при равном объёме, но очень большие дозы за одну тренировку дают убывающую отдачу).'), refIds: ['schoenfeld2019_frequency', 'pelland2026_volume_frequency'], implementedIn: 'src/domain/analysis.ts',
  },
  // ---- Recovery
  {
    id: 'recovery_windows', area: 'recovery',
    rule: L('Recovery window by the last significant session: ≤3 sets 24 h, ≤6 36 h, ≤9 48 h, ≤12 60 h, more 72 h; +12 h for ≥ 2 failure sets, a new exercise, a large muscle after > 9 sets, short sleep or high fatigue; +12/24 h for soreness. Counted from when the session ended.', 'Окно восстановления по последней значимой тренировке: ≤ 3 подходов — 24 ч, ≤ 6 — 36 ч, ≤ 9 — 48 ч, ≤ 12 — 60 ч, больше — 72 ч; +12 ч за ≥ 2 подходов до отказа, новое упражнение, крупную мышцу после > 9 подходов, короткий сон или сильную усталость; +12/24 ч за мышечную боль. Отсчёт идёт от окончания тренировки.'),
    value: L('24–72 h (+modifiers)', '24–72 ч (+ поправки)'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Performance and damage markers usually recover within 24–72 h, longer after high volume, failure or unaccustomed work; advice, not a rule.', 'Показатели работоспособности и повреждения обычно восстанавливаются за 24–72 ч, дольше — после большого объёма, отказа или непривычной работы; это совет, а не правило.'), refIds: ['morannavarro2017_recovery_failure', 'damas2018_damage_review'], implementedIn: 'src/domain/recovery.ts',
  },
  // ---- Progression
  {
    id: 'double_progression', area: 'progression',
    rule: L('Increase load only after all working sets reach the top of the rep range in two consecutive comparable sessions — the reps themselves are the evidence, an effort answer is not required (Part 6). One session is enough only when at least two sets were each clearly too light (RIR ≥ target + 2, or "too easy") and the reps did not fall across them. Never right after pain. Reduce when technique broke down on at least half the session\'s sets AND that is confirmed: on two or more sets, or by reps under the bottom of the range at that load, or by the same in the session before. Also reduce one step when most sets fall under the range while the trend is declining and a short rest does not explain it.', 'Повышайте вес только после того, как все рабочие подходы достигли верхней границы диапазона повторений в двух сопоставимых тренировках подряд — доказательством служат сами повторения, ответ об усилии не обязателен (часть 6). Одной тренировки достаточно, только когда как минимум два подхода были каждый явно слишком лёгкими (RIR ≥ целевой + 2 или «слишком легко») и повторения от подхода к подходу не упали. Никогда — сразу после боли. Снижайте, когда техника нарушилась как минимум в половине подходов тренировки И это подтверждено: в двух или более подходах, либо повторениями ниже нижней границы диапазона с этим весом, либо тем же в предыдущей тренировке. Также снижайте на один шаг, когда большинство подходов ниже диапазона, тренд снижается и короткий отдых этого не объясняет.'),
    value: L('2 sessions / 1 if ≥ 2 sets clearly light', '2 тренировки / 1, если ≥ 2 подходов явно лёгкие'), basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Progressive overload over time is what matters; requiring repeat performance avoids reacting to one good day, and requiring confirmation avoids reacting to one subjective answer (effort perception errs by 1–2+ reps).', 'Важна прогрессирующая нагрузка во времени; требование повторить результат не даёт реагировать на один удачный день, а требование подтверждения — на один субъективный ответ (восприятие усилия ошибается на 1–2 повторения и больше).'), refIds: ['plotkin2022_progression', 'currier2026_acsm_position', 'halperin2022_rir_accuracy'], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'benchmark_exclusion', area: 'progression',
    rule: L('Wrong-weight, pain, compromised-technique and technical-failure sets stay in history but never judge progress.', 'Подходы с неверным весом, болью, нарушенной техникой и отказом по технике остаются в истории, но никогда не используются для оценки прогресса.'),
    value: L('excluded', 'не учитываются'), basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: L('They do not reflect comparable performance.', 'Они не отражают сопоставимый результат.'), refIds: [], implementedIn: 'src/domain/progression.ts, src/domain/feedback.ts',
  },
  {
    id: 'plateau', area: 'progression',
    rule: L('Possible plateau: ≥ 4 representative sessions over ≥ 21 days with no new best in the last two; fatigued sessions set aside; check load, rest, technique, effort and recovery before adding volume.', 'Возможное плато: ≥ 4 показательных тренировок за ≥ 21 день без нового рекорда в последних двух; тренировки на фоне усталости откладываются; прежде чем добавлять объём, проверьте вес, отдых, технику, усилие и восстановление.'),
    value: L('4 sessions / 21 days', '4 тренировки / 21 день'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Short-term noise is large; a plateau call needs several comparable sessions.', 'Краткосрочный шум велик; для вывода о плато нужно несколько сопоставимых тренировок.'), refIds: [], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'single_bad_session', area: 'progression',
    rule: L('A lone latest session ≥ 5 % below the usual level (or ≥ 5 % below the previous session and under the usual level) is set aside: the trend is judged on the sessions before it. A decline by slope also needs the last two sessions below the first.', 'Единичная последняя тренировка на ≥ 5 % ниже обычного уровня (или на ≥ 5 % ниже предыдущей тренировки и ниже обычного уровня) откладывается: тренд оценивается по тренировкам до неё. Для снижения по наклону также нужно, чтобы две последние тренировки были ниже первой.'),
    value: '5 %', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Day-to-day performance varies with sleep, food and stress; one bad day must not create a plateau, a decline or a load reduction.', 'Результат день ото дня меняется из-за сна, питания и стресса; один плохой день не должен создавать плато, снижение или уменьшение веса.'), refIds: [], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'sustained_decline', area: 'progression',
    rule: L('Declining also when, over ≥ 6 comparable sessions in 8 weeks, the median of the last 3 is ≥ 8 % below the median of the first 3 and all of the last 3 are below all of the first 3.', 'Снижение фиксируется и тогда, когда за ≥ 6 сопоставимых тренировок в течение 8 недель медиана последних 3 на ≥ 8 % ниже медианы первых 3 и все последние 3 ниже всех первых 3.'),
    value: L('8 % over 8 weeks', '8 % за 8 недель'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Slow declines of ~1 % per session never cross the per-session slope threshold within 6 sessions, yet add up to a clear loss over two months.', 'Медленное снижение на ~1 % за тренировку не пересекает порог наклона за 6 тренировок, но за два месяца складывается в явную потерю.'), refIds: [], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'index_scale', area: 'progression',
    rule: L('A kg-based index (RIR-adjusted Epley), a body + belt index (weighted pull-ups / dips, body weight known before the session — an estimate) and a reps-based index (reps + RIR) are never compared: trends and progress % use only sessions on the latest scale. Belt-only Epley (no body weight logged) never produces a %.', 'Индекс в кг (формула Эпли с поправкой на RIR), индекс «тело + пояс» (подтягивания и брусья с отягощением, вес тела известен до тренировки — оценка) и индекс по повторениям (повторения + RIR) никогда не сравниваются: тренды и % прогресса используют только тренировки на последней шкале. Формула Эпли только по весу на поясе (вес тела не записан) никогда не даёт %.'),
    value: L('same scale only', 'только одна шкала'), basis: 'heuristic', confidence: 'high', configurable: null,
    rationale: L('The two indices have different units; a bodyweight set of 12 reps (index 13) followed by a +5 kg set (index 6.8) is not a 48 % loss.', 'У двух индексов разные единицы; подход с весом тела на 12 повторений (индекс 13), за которым следует подход с +5 кг (индекс 6,8), — это не потеря 48 %.'), refIds: [], implementedIn: 'src/domain/progression.ts, src/domain/baseline.ts',
  },
  {
    id: 'rest_attribution', area: 'progression',
    rule: L('A rep drop after a clearly shorter rest (< 70 % of the usual) is attributed to rest, not strength loss.', 'Падение повторений после явно более короткого отдыха (< 70 % обычного) относится на счёт отдыха, а не потери силы.'),
    value: L('< 70 % of median', '< 70 % медианы'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Longer rests preserve more repetitions in later sets.', 'Более долгий отдых сохраняет больше повторений в следующих подходах.'), refIds: ['schoenfeld2016_rest', 'singer2024_rest'], implementedIn: 'src/domain/progression.ts',
  },
  // ---- Prescription
  {
    id: 'presc_rir_targets', area: 'prescription',
    rule: L('Target RIR: machines/isolation 1–2; free-weight compounds 2–3; +1 after recent technique breakdown or technical failure; never failure on every set.', 'Целевой RIR: тренажёры и изолирующие упражнения 1–2; многосуставные со свободным весом 2–3; +1 после недавнего нарушения техники или отказа по технике; никогда не отказ в каждом подходе.'),
    value: '1–2 / 2–3', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Stopping a few reps short gives similar growth with less fatigue; stable machines make proximity to failure easier to judge and safer.', 'Остановка за несколько повторений до отказа даёт сходный рост при меньшей усталости; на устойчивых тренажёрах близость к отказу оценить проще и безопаснее.'), refIds: ['refalo2023_failure_meta', 'robinson2024_proximity_failure', 'halperin2022_rir_accuracy'], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'presc_rep_ranges', area: 'prescription',
    rule: L("Rep range per set comes from the owner's own reps at that load on that machine, kept inside a broad exercise range (isolation ~8–20, compounds ~5–12).", 'Диапазон повторений для подхода берётся из ваших собственных повторений с этим весом на этом тренажёре и удерживается в широком диапазоне упражнения (изолирующие ~8–20, многосуставные ~5–12).'),
    value: L('personal', 'личный'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Similar hypertrophy across a wide load range when sets are hard; ranges are for practicality, not magic.', 'Гипертрофия сходна в широком диапазоне весов, когда подходы тяжёлые; диапазоны нужны для удобства, в них нет магии.'), refIds: ['schoenfeld2017_load', 'lopez2021_load_network'], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'presc_set_count', area: 'prescription',
    rule: L("Sets = today's share for the exercise's primary muscle ÷ its coefficient − sets already done for that muscle today; 1…4 (isolation) or 1…5 (compound); 0 with a reason when the week is covered or the muscle is still recovering.", 'Подходы = доля на сегодня для основной мышцы упражнения ÷ её коэффициент − подходы, уже выполненные сегодня на эту мышцу; 1…4 (изолирующие) или 1…5 (многосуставные); 0 с объяснением, когда неделя закрыта или мышца ещё восстанавливается.'),
    value: '≤ 4 / ≤ 5', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Follows the weekly plan without cramming; caps keep single-exercise volume practical.', 'Следует недельному плану, не добирая всё за один раз; ограничения удерживают объём одного упражнения в практичных рамках.'), refIds: [], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'presc_rest', area: 'prescription',
    rule: L("Rest = the owner's median rest on that machine, bounded (isolation 60–180 s, compounds 120–300 s).", 'Отдых = ваш медианный отдых на этом тренажёре в заданных границах (изолирующие 60–180 с, многосуставные 120–300 с).'),
    value: L('personal, bounded', 'личный, в границах'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Very short rests reduce volume load; longer rests modestly favour hypertrophy in multi-joint lifts.', 'Очень короткий отдых снижает объёмную нагрузку; более долгий отдых умеренно благоприятнее для гипертрофии в многосуставных упражнениях.'), refIds: ['singer2024_rest', 'schoenfeld2016_rest'], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'presc_confidence', area: 'prescription',
    rule: L('Confidence high = ≥ 4 comparable sessions in 8 weeks, moderate = 2–3, low = 0–1 ("calibrating"); calendar days alone never unlock it.', 'Уверенность высокая = ≥ 4 сопоставимых тренировок за 8 недель, средняя = 2–3, низкая = 0–1 («калибровка»); одни лишь календарные дни её никогда не открывают.'),
    value: '4 / 2–3 / 0–1', basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Honest uncertainty: a new machine or variation has no comparable history.', 'Честная неопределённость: у нового тренажёра или варианта нет сопоставимой истории.'), refIds: [], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'warmups_not_counted', area: 'prescription',
    rule: L('Warm-up loads are SUGGESTED per exercise as text (fewer when the muscle was already trained this session). A set tagged as a warm-up never counts as volume; since Part 6 the tag comes from the numbers (rule warmup_by_reserve) or from the owner.', 'Разминочные веса ПРЕДЛАГАЮТСЯ для каждого упражнения текстом (меньше, если мышца уже работала в этой тренировке). Подход с пометкой «разминочный» никогда не засчитывается в объём; начиная с части 6 пометка ставится по цифрам (правило warmup_by_reserve) или вами.'),
    value: L('not counted', 'не засчитываются'), basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Warm-ups prepare the movement; they are far from failure. Acute studies of warm-up sets and later repetition performance disagree, so no number of warm-up sets is required.', 'Разминка готовит к движению; она далека от отказа. Краткосрочные исследования разминочных подходов и последующего числа повторений расходятся, поэтому определённое число разминочных подходов не требуется.'), refIds: ['ribeiro2014_warmup', 'viveiros2024_warmup_load', 'lisboa2024_specific_warmup_older_women', 'souza2024_warmup_load_squat'], implementedIn: 'src/domain/progression.ts, src/domain/prescription.ts',
  },
  // ---- Execution / tempo
  {
    id: 'tempo_no_credit', area: 'execution',
    rule: L('Tempo never adds or removes volume credit: no bonus for slow negatives, no downgrade for a faster eccentric. Only momentum or a shortened range, reported as technique, can change credit (via the technique rule).', 'Темп никогда не добавляет и не снимает зачёт объёма: нет бонуса за медленное опускание, нет снижения за более быструю эксцентрическую фазу. Изменить зачёт могут только инерция или укороченная амплитуда, отмеченные как техника (через правило о технике).'),
    value: L('no multiplier', 'без множителя'), basis: 'research', confidence: 'moderate', configurable: null,
    rationale: L('Pooled evidence shows similar hypertrophy over a wide range of repetition durations; very slow reps are not superior.', 'Объединённые данные показывают сходную гипертрофию в широком диапазоне длительности повторения; очень медленные повторения не лучше.'), refIds: ['enes2025_tempo', 'schoenfeld2015_repduration', 'amdi2025_eccduration', 'dasilva2025_ecc_con'], implementedIn: 'src/domain/quality.ts, src/data/scientific-evidence/tempo.ts',
  },

  // ---- Exercise choice, order and fatigue cost (Part 5)
  {
    id: 'fatigue_cost', area: 'choice',
    rule: L('Each exercise has a fatigue cost for the rest of the session: HIGH (heavy free-weight squat / hinge / lunge, barbell presses and rows, weighted pull-ups / dips), MODERATE (machine and dumbbell compounds, bodyweight pull-ups), LOW (single-joint isolation).', 'У каждого упражнения есть цена усталости для оставшейся части тренировки: ВЫСОКАЯ (тяжёлые приседания, наклоны и выпады со свободным весом, жимы и тяги со штангой, подтягивания и брусья с отягощением), СРЕДНЯЯ (многосуставные в тренажёрах и с гантелями, подтягивания с весом тела), НИЗКАЯ (односуставные изолирующие).'),
    value: L('high / moderate / low', 'высокая / средняя / низкая'), basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: L('Exercises done after demanding work lose repetitions and load (acute data), and fatigue partly carries over to the repetition capacity of other muscles. No long-term trial quantifies a per-exercise cost, so the classes are a practical estimate, not calories and not difficulty.', 'Упражнения, выполняемые после тяжёлой работы, теряют повторения и вес (краткосрочные данные), и усталость частично переносится на способность других мышц выполнять повторения. Ни одно длительное исследование не измеряет цену отдельного упражнения, поэтому классы — практическая оценка, а не калории и не сложность.'),
    refIds: ['spreuwenberg2006_squat_order', 'behm2021_nonlocal_fatigue', 'simao2012_exercise_order_review'], implementedIn: 'src/data/exercises.ts, src/domain/fatigue.ts',
  },
  {
    id: 'exercise_order', area: 'choice',
    rule: L('Default order HIGH → MODERATE → LOW fatigue cost, larger muscles first; a priority muscle (high priority or the largest recovered weekly deficit) may go first even as isolation. Order advice is a soft suggestion ("CONSIDER LATER"), never a block.', 'Порядок по умолчанию: ВЫСОКАЯ → СРЕДНЯЯ → НИЗКАЯ цена усталости, сначала более крупные мышцы; приоритетная мышца (высокий приоритет или самый большой недельный дефицит среди восстановившихся) может идти первой даже в изолирующем упражнении. Совет о порядке — мягкое предложение («ЛУЧШЕ ПОЗЖЕ»), никогда не запрет.'),
    value: L('compound first unless prioritised', 'сначала многосуставные, если нет приоритета'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: L('Muscles → priority', 'Мышцы → приоритет'),
    rationale: L('Whatever is trained first gains more strength and gets more repetitions; hypertrophy differs little or not at all between orders (meta-analysis). So order protects performance of the lifts that matter most; it is not a growth rule.', 'То, что тренируется первым, больше прибавляет в силе и получает больше повторений; гипертрофия при разном порядке отличается мало или не отличается вовсе (метаанализ). Поэтому порядок защищает результат в самых важных упражнениях; это не правило роста.'),
    refIds: ['nunes2021_exercise_order', 'simao2012_exercise_order_review', 'spineti2010_order_strength_volume', 'avelar2019_order_hypertrophy', 'brandao2020_mj_sj_order', 'hermann2026_pre_exhaustion', 'acsm2009_progression'], implementedIn: 'src/domain/exerciseChoice.ts, src/domain/planner.ts',
  },
  {
    id: 'choice_status', area: 'choice',
    rule: L('Exercise choice: CONSIDER ALTERNATIVE when the primary muscle is still inside its recovery window, a significant synergist (coefficient ≥ 0.5) is and an alternative spares it, or the primary is above its weekly upper bound; ACCEPTABLE when a synergist is loaded without an alternative, the week is already met or the trend is declining; GOOD otherwise. A weekly deficit never overrides recovery.', 'Выбор упражнения: «ЛУЧШЕ ДРУГОЕ», когда основная мышца ещё находится в окне восстановления, либо в нём находится значимый синергист (коэффициент ≥ 0,5) и альтернатива его щадит, либо основная мышца выше недельной верхней границы; «ДОПУСТИМО», когда синергист нагружен, а альтернативы нет, неделя уже закрыта или тренд снижается; иначе — «ХОРОШИЙ ВЫБОР». Недельный дефицит никогда не отменяет восстановление.'),
    value: L('good / acceptable / reconsider', 'хороший выбор / допустимо / пересмотреть'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Combines the existing recovery, volume and trend heuristics into one transparent call with the reason shown; it never blocks and never claims a biological state.', 'Объединяет существующие эвристики восстановления, объёма и тренда в одно прозрачное решение с показанной причиной; оно никогда не блокирует и никогда не утверждает что-либо о биологическом состоянии.'),
    refIds: [], implementedIn: 'src/domain/exerciseChoice.ts',
  },
  {
    id: 'choice_learning', area: 'choice',
    rule: L('A recovery warning for an exercise is softened to ACCEPTABLE only after ≥ 3 overridden warnings whose next comparable performance was not lower (≥ 2 of 3). One workout never changes anything; subjective feedback alone is never proof.', 'Предупреждение о восстановлении для упражнения смягчается до «ДОПУСТИМО» только после ≥ 3 предупреждений, вопреки которым вы продолжили и после которых следующий сопоставимый результат не был ниже (≥ 2 из 3). Одна тренировка никогда ничего не меняет; одни лишь субъективные ощущения никогда не служат доказательством.'),
    value: L('≥ 3 observations', '≥ 3 наблюдений'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Personal responses vary; repeated observations are needed before a heuristic is relaxed.', 'Индивидуальные реакции различаются; прежде чем ослабить эвристику, нужны повторные наблюдения.'),
    refIds: [], implementedIn: 'src/domain/exerciseChoice.ts',
  },
  // ---- Planner (Part 5)
  {
    id: 'planner_modes', area: 'planner',
    rule: L('LEARNING until ≥ 8 well-documented workouts over ≥ 21 days with ≥ 80 % of machine exercises linked to a machine and ≥ 3 frequent exercises calibrated (PROVISIONAL ADAPTIVE); FULL ADAPTIVE after ≥ 10 well-documented workouts over ≥ 28 days with calibrated familiar exercises covering ≥ 80 % of the major muscles\' weekly targets. Never by calendar alone.', 'ЗНАКОМСТВО — до ≥ 8 хорошо записанных тренировок за ≥ 21 день, при этом ≥ 80 % упражнений в тренажёрах привязаны к тренажёру и ≥ 3 частых упражнений откалиброваны (ПРЕДВАРИТЕЛЬНО АДАПТИВНЫЙ); ПОЛНОСТЬЮ АДАПТИВНЫЙ — после ≥ 10 хорошо записанных тренировок за ≥ 28 дней, когда откалиброванные знакомые упражнения покрывают ≥ 80 % недельных целей основных мышц. Никогда — только по календарю.'),
    value: L('8 / 21 d → 10 / 28 d + 80 %', '8 / 21 дн. → 10 / 28 дн. + 80 %'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Personal prescriptions need comparable, well-logged exposures per exercise and machine; badly logged sessions do not count.', 'Для личных назначений нужны сопоставимые, хорошо записанные тренировки по каждому упражнению и тренажёру; плохо записанные тренировки не считаются.'),
    refIds: [], implementedIn: 'src/domain/readiness.ts',
  },
  {
    id: 'planner_session_allocation', area: 'planner',
    rule: L('Sets are allocated for the WHOLE session: the open share of today for each muscle (capped, catch-up-free) is covered by fractional contributions of all planned exercises, without overshoot; muscles still recovering get no sets.', 'Подходы распределяются на ВСЮ тренировку: открытая доля на сегодня для каждой мышцы (с ограничением, без навёрстывания) покрывается дробными вкладами всех запланированных упражнений, без превышения; мышцы, которые ещё восстанавливаются, подходов не получают.'),
    value: L('today share − planned contributions', 'доля на сегодня − вклад запланированных упражнений'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: L('Settings → Set-quality model', 'Настройки → Модель качества подхода'),
    rationale: L('Fractional counting of indirect work and the per-session taper; avoids the first exercise of a muscle taking the whole share of the day.', 'Дробный учёт косвенной работы и плавное снижение зачёта в пределах тренировки; так первое упражнение на мышцу не забирает всю долю дня.'),
    refIds: ['pelland2026_volume_frequency', 'schoenfeld2017_volume'], implementedIn: 'src/domain/planner.ts',
  },
  {
    id: 'planner_calibration', area: 'planner',
    rule: L('Loads only from the same exercise × machine × configuration history on its real increments: calibrated (≥ 2 comparable sessions with effort), provisional (1 session or older history), needs data (no kg — "pick a load for 10–12 reps at RIR 2–3"). Kg is never transferred between machines.', 'Веса берутся только из истории того же упражнения × тренажёра × конфигурации с её реальными шагами веса: откалибровано (≥ 2 сопоставимых тренировок с усилием), предварительно (1 тренировка или более старая история), нужны данные (без кг — «подберите вес на 10–12 повторений при RIR 2–3»). Килограммы никогда не переносятся с тренажёра на тренажёр.'),
    value: L('2 / 1 / 0 comparable sessions', '2 / 1 / 0 сопоставимых тренировок'), basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Loads on two machines are not comparable (cam profile, ratio, friction).', 'Веса на двух тренажёрах несопоставимы (профиль эксцентрика, передаточное отношение, трение).'),
    refIds: [], implementedIn: 'src/domain/planner.ts, src/domain/readiness.ts',
  },
  {
    id: 'planner_returning', area: 'planner',
    rule: L('After ≥ 10 days without training the plan is marked "returning"; after > 14 days loads start one step below the last comparable session. Missed sessions never add catch-up volume.', 'После ≥ 10 дней без тренировок план помечается «возвращение»; после > 14 дней веса начинаются на один шаг ниже последней сопоставимой тренировки. Пропущенные тренировки никогда не добавляют объём «вдогонку».'),
    value: L('10 / 14 days', '10 / 14 дней'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('Short breaks cost little; a cautious first session back protects technique and recovery.', 'Короткие перерывы стоят немногого; осторожная первая тренировка после перерыва бережёт технику и восстановление.'),
    refIds: [], implementedIn: 'src/domain/planner.ts',
  },
  {
    id: 'planner_learning', area: 'planner',
    rule: L('Preferences shift only after ≥ 3 repeated choices at the same gym (e.g. always replaces X with Y). Substitutions because equipment was busy, and pain-related skips, never count as a preference.', 'Предпочтения сдвигаются только после ≥ 3 повторяющихся выборов в одном зале (например, X всегда заменяется на Y). Замены из-за занятого оборудования и пропуски из-за боли никогда не считаются предпочтением.'),
    value: L('≥ 3, busy excluded', '≥ 3, «занято» не считается'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('An occupied machine says nothing about what the owner prefers; one decision is not a pattern.', 'Занятый тренажёр ничего не говорит о ваших предпочтениях; одно решение — ещё не закономерность.'),
    refIds: [], implementedIn: 'src/domain/planner.ts',
  },
  {
    id: 'volume_individual', area: 'volume',
    rule: L('After Learning Mode each muscle target starts from its own baseline and changes only on evidence: +1–2 when stalled with consistent technique, adequate effort (RIR ≤ 3), good recovery, a stable volume for ≥ 3 weeks and no history of more volume failing; −1–2 (or back to the earlier productive level) on repeated decline with adequate effort, consistently poor recovery, technique breakdown on ≥ 25 % of sets, or a recent increase without better performance; otherwise hold. Never raised only because it is below a generic reference.', 'После режима знакомства цель каждой мышцы начинается с её собственного базового уровня и меняется только на основании данных: +1–2, когда прогресс остановился при стабильной технике, достаточном усилии (RIR ≤ 3), хорошем восстановлении, стабильном объёме в течение ≥ 3 недель и без случаев, когда больший объём не сработал; −1–2 (или возврат к прежнему продуктивному уровню) при повторном снижении на фоне достаточного усилия, стабильно плохом восстановлении, нарушении техники в ≥ 25 % подходов или недавнем повышении без улучшения результата; иначе — без изменений. Никогда не повышается только потому, что она ниже общего ориентира.'),
    value: L('±1–2 effective sets/week', '±1–2 эффективных подхода в неделю'), basis: 'research_informed_heuristic', confidence: 'low', configurable: L('Muscles → target per muscle', 'Мышцы → цель для мышцы'),
    rationale: L('Volume shows a dose–response with diminishing returns and large individual differences; the productive volume of each muscle has to be found from its own response, gradually, not from a population average.', 'Объём показывает зависимость «доза — эффект» с убывающей отдачей и большими индивидуальными различиями; продуктивный объём для каждой мышцы нужно находить по её собственной реакции, постепенно, а не по среднему для популяции.'),
    refIds: ['pelland2026_volume_frequency', 'schoenfeld2017_volume', 'bazvalle2022_volume'], implementedIn: 'src/domain/volumeResponse.ts, src/domain/targets.ts',
  },
  {
    id: 'planner_live_reassessment', area: 'planner',
    rule: L('During a workout every exercise not yet started is re-prescribed from what was ACTUALLY done (any order): sets from the open share minus completed contributions, warm-ups from completed same-muscle work, order advice from completed demanding lifts. Since Part 6 the plan of an exercise is a TARGET line (no prepared set rows): untouched targets update; a target the owner edited is never overwritten.', 'Во время тренировки каждое ещё не начатое упражнение назначается заново исходя из ФАКТИЧЕСКИ выполненного (в любом порядке): подходы — из открытой доли за вычетом выполненных вкладов, разминка — с учётом выполненной работы на ту же мышцу, совет о порядке — с учётом выполненных тяжёлых упражнений. Начиная с части 6 план упражнения — это строка с ЦЕЛЬЮ (без заготовленных строк подходов): нетронутые цели обновляются; цель, которую вы изменили, никогда не перезаписывается.'),
    value: L('on every completed set / reorder', 'при каждом выполненном подходе / смене порядка'), basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: L('Real gyms have busy machines; the planned order is never assumed to have been followed.', 'В реальных залах тренажёры бывают заняты; никогда не предполагается, что запланированный порядок был соблюдён.'),
    refIds: [], implementedIn: 'src/domain/planner.ts, src/ui/pages/Train.tsx',
  },
  // ---- Part 6: log after the set, effort from the numbers, context within a session
  {
    id: 'warmup_by_reserve', area: 'effort',
    rule: L('A set is credited by how far from failure it was, not by a label. For a set done BEFORE the best set of the same exercise in the session, reps possible at its load follow from the best set (Epley inverse: 30 × (best ÷ load − 1)); possible − done = estimated reps in reserve, credited through the SAME RIR table (0–3 → 1, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥ 8 → 0). Without an effort answer the estimate never earns more than the provisional 0.75. Estimated credit 0 → the set is tagged a warm-up automatically (correctable by the owner; the owner\'s tag is never changed). A clearly lighter set AFTER the best set (at most 60 % of its load, no effort answer) loses one more rep of reserve per set of that side since the best one; a heavier back-off set without an answer is not estimated from the best set (it stays provisional unless the next set shows a clear rep drop). Bodyweight, belt-only and assisted loads get no load-based estimate.', 'Подход засчитывается по тому, насколько далеко он был от отказа, а не по ярлыку. Для подхода, выполненного ДО лучшего подхода того же упражнения в тренировке, возможное число повторений с его весом выводится из лучшего подхода (обратная формула Эпли: 30 × (лучший ÷ вес − 1)); возможные − выполненные = оценка повторов в запасе, которая засчитывается по ТОЙ ЖЕ таблице RIR (0–3 → 1; 4 → 0,6; 5 → 0,3; 6–7 → 0,15; ≥ 8 → 0). Без ответа об усилии оценка никогда не даёт больше предварительных 0,75. Оценочный зачёт 0 → подход автоматически помечается как разминочный (вы можете это исправить; вашу пометку приложение никогда не меняет). Заметно более лёгкий подход ПОСЛЕ лучшего (не больше 60 % его веса, без ответа об усилии) теряет ещё одно повторение запаса за каждый подход той же стороны после лучшего; более тяжёлый облегчённый подход без ответа по лучшему подходу не оценивается (остаётся предварительным, если следующий подход не показывает явного падения повторений). Для веса тела, веса только на поясе и работы с поддержкой оценка по весу не делается.'),
    value: L('reserve = 30 × (best ÷ load − 1) − reps', 'запас = 30 × (лучший ÷ вес − 1) − повторения'), basis: 'research_informed_heuristic', confidence: 'low', configurable: L('Settings → Set-quality model → Check effort against the numbers', 'Настройки → Модель качества подхода → Сверять усилие с цифрами'),
    rationale: L('Volume research counts sets taken to or near failure, and growth falls as a set stops further from failure — so a light ramp set is not a working set, while a heavy last ramp set partly is. The estimate uses a repetitions-to-failure equation, which is accurate up to about 10 reps and increasingly rough above (people differ by ± 2.5 reps at 80 % and ± 4.4 at 60 % of 1RM); it cannot see a set that was hard for another reason. That is why it only lowers credit, is flagged as an estimate, and the one-tap effort answer exists.', 'Исследования объёма считают подходы, выполненные до отказа или близко к нему, а рост снижается, когда подход заканчивается дальше от отказа, — поэтому лёгкий подводящий подход не является рабочим, а тяжёлый последний подводящий подход отчасти является. Оценка использует уравнение «повторения до отказа», которое точно примерно до 10 повторений и всё грубее выше (люди различаются на ± 2,5 повторения при 80 % и на ± 4,4 при 60 % от 1RM); оно не видит подход, который был тяжёлым по другой причине. Поэтому оценка только снижает зачёт, помечается как оценка, и существует ответ об усилии в одно касание.'),
    refIds: ['bazvalle2021_sets_quantification', 'dankel2017_training_to_fatigue', 'robinson2024_proximity_failure', 'refalo2023_failure_meta', 'reynolds2006_multiple_rm_prediction', 'nuzzo2024_reps_percent_1rm', 'roberts2025_rtf_equations_crossvalidation'], implementedIn: 'src/domain/perception.ts, src/domain/quality.ts, src/domain/volume.ts',
  },
  {
    id: 'perception_check', area: 'effort',
    rule: L('A reported effort (RIR, failure, or the one-tap EASY / GOOD / HARD / MAX) is cross-checked against the logged numbers of the same exercise. It is used unless the numbers clearly contradict it: (1) a ramp estimate of ≥ 5 reps in reserve that is ≥ 3 reps further from failure than the report, on a set at ≤ 75 % of the load of the best set (per side) → credited by the numbers; (2) reported easy (≥ 4 in reserve) but reps fell by ≥ 2 on the next set at the same load after a rest of ≥ 60 s, and that next set was not itself reported with ≥ 3 in reserve → credited as a hard set; (3) reported at the limit but the next set matched or beat it → credit unchanged, flagged. With no report, a rep collapse on the next set counts as a hard set. The stored answer is never rewritten; disagreements are shown ("felt harder / easier than the numbers").', 'Сообщённое усилие (RIR, отказ или ответ в одно касание ЛЕГКО / ХОРОШО / ТЯЖЕЛО / ОТКАЗ) сверяется с записанными цифрами того же упражнения. Оно используется, если цифры явно ему не противоречат: (1) оценка по подводящим подходам ≥ 5 повторов в запасе, которая на ≥ 3 повторения дальше от отказа, чем сообщено, для подхода с весом ≤ 75 % от веса лучшего подхода (той же стороны) → зачёт по цифрам; (2) сообщено «легко» (≥ 4 в запасе), но в следующем подходе с тем же весом после отдыха ≥ 60 с повторения упали на ≥ 2, а сам следующий подход не был отмечен как ≥ 3 в запасе → засчитывается как тяжёлый подход; (3) сообщено «на пределе», но следующий подход такой же или лучше → зачёт не меняется, ставится пометка. Без ответа резкое падение повторений в следующем подходе считается тяжёлым подходом. Сохранённый ответ никогда не переписывается; расхождения показываются («ощущалось тяжелее / легче, чем по цифрам»).'),
    value: L('gap ≥ 3 reps · next-set drop ≥ 2 reps', 'разница ≥ 3 повт. · падение в следующем подходе ≥ 2 повт.'), basis: 'research_informed_heuristic', confidence: 'low', configurable: L('Settings → Set-quality model → Check effort against the numbers', 'Настройки → Модель качества подхода → Сверять усилие с цифрами'),
    rationale: L('People judge reps in reserve to about 1 rep within 0–5 reps of failure, but err by more than 2 reps at 7–10 from failure, more in sets above 12 reps and in first sets, and on average believe they are closer to failure than they are. A 3-rep gap at ≥ 5 in reserve is outside that error; what the next set shows at the same load is direct evidence. The thresholds themselves are practical choices.', 'Люди оценивают повторы в запасе с точностью примерно до 1 повторения в пределах 0–5 повторений до отказа, но ошибаются более чем на 2 повторения за 7–10 до отказа, сильнее — в подходах более чем на 12 повторений и в первых подходах, и в среднем считают, что они ближе к отказу, чем на самом деле. Разница в 3 повторения при ≥ 5 в запасе выходит за пределы этой ошибки; то, что показывает следующий подход с тем же весом, — прямое свидетельство. Сами пороги — практический выбор.'),
    refIds: ['halperin2022_rir_accuracy', 'hackett2017_erf_accuracy', 'zourdos2021_rir_accuracy_squat', 'refalo2024_rir_accuracy_bench', 'remmert2023_rir_accuracy_single_joint', 'steele2017_predict_reps_failure', 'armes2020_predict_task_failure'], implementedIn: 'src/domain/perception.ts, src/domain/quality.ts',
  },
  {
    id: 'perception_bias', area: 'effort',
    rule: L('Over every set that has both an effort answer and clear next-set evidence (≥ 12 sets), the app counts how often the answer was harder / easier than the numbers and names a tendency when ≥ 30 % point one way. Shown in Settings; it changes no entry and no credit.', 'По всем подходам, у которых есть и ответ об усилии, и ясное свидетельство следующего подхода (≥ 12 подходов), приложение считает, как часто ответ был тяжелее / легче, чем по цифрам, и называет тенденцию, когда ≥ 30 % указывают в одну сторону. Показывается в настройках; не меняет ни одной записи и никакого зачёта.'),
    value: L('≥ 12 sets · ≥ 30 %', '≥ 12 подходов · ≥ 30 %'), basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: L('The direction of a personal bias is useful to know; the group-level bias is toward underpredicting the reps left.', 'Направление личного смещения полезно знать; на уровне группы смещение — в сторону занижения оставшихся повторений.'), refIds: ['halperin2022_rir_accuracy', 'hickmott2024_subjective_vs_velocity_rir'], implementedIn: 'src/domain/perception.ts',
  },
  {
    id: 'index_basis', area: 'progression',
    rule: L('One index basis per history: reps in reserve are added to the reps (RIR-adjusted Epley) only when EVERY scored session of that history has an RIR on its top set; otherwise the index of all its sessions is built from weight and reps alone. A history never mixes the two.', 'Одна основа индекса на историю: повторы в запасе прибавляются к повторениям (формула Эпли с поправкой на RIR), только когда в КАЖДОЙ учтённой тренировке этой истории у лучшего подхода есть RIR; иначе индекс всех её тренировок строится только по весу и повторениям. История никогда не смешивает оба варианта.'),
    value: L('all sessions with RIR → reps + RIR, else reps', 'во всех тренировках есть RIR → повторения + RIR, иначе повторения'), basis: 'heuristic', confidence: 'high', configurable: null,
    rationale: L('Adding RIR to some sessions and not to others fakes a change: 60 × 12 reads as 90 with "3 in reserve" and as 84 without (formula audit F-1). No study validates an RIR-adjusted prediction equation; logged RIR is itself uncertain by 1–2 reps.', 'Если прибавлять RIR в одних тренировках и не прибавлять в других, получается мнимое изменение: 60 × 12 читается как 90 с «3 в запасе» и как 84 без них (аудит формул F-1). Ни одно исследование не подтверждает уравнение прогноза с поправкой на RIR; записанный RIR сам неточен на 1–2 повторения.'), refIds: ['halperin2022_rir_accuracy', 'nickerson2020_rtf_equations_epley'], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'preload_context', area: 'progression',
    rule: L('Every session of a history has a context: pre-load = fractional sets already performed in that session, before the exercise\'s first set, by earlier exercises that train one of its primary muscles with a coefficient ≥ 0.5 (order = completion times). FRESH < 2 ≤ PRE-LOADED. Trend, plateau, decline, double progression and progress % compare like with like when the latest context has ≥ 3 sessions; otherwise a pre-loaded session\'s index is normalised: × (1 + min(6 %, d × pre-load)), d = the owner\'s own drop per pre-loading set when the history has ≥ 2 sessions in each context (kept within 0–3 %), else 1 %. The prescription lowers the rep target by the equivalent reps and says so; a drop of that size is never called a decline and never reduces the load.', 'У каждой тренировки в истории есть контекст: предварительная нагрузка = дробные подходы, уже выполненные в этой тренировке до первого подхода упражнения в более ранних упражнениях, которые нагружают одну из его основных мышц с коэффициентом ≥ 0,5 (порядок = время выполнения). НА СВЕЖИЕ СИЛЫ < 2 ≤ ПОСЛЕ НАГРУЗКИ. Тренд, плато, снижение, двойная прогрессия и % прогресса сравнивают подобное с подобным, когда в последнем контексте есть ≥ 3 тренировок; иначе индекс тренировки «после нагрузки» нормализуется: × (1 + min(6 %, d × предварительная нагрузка)), d = ваше собственное падение на один предварительный подход, когда в истории есть ≥ 2 тренировок в каждом контексте (в пределах 0–3 %), иначе 1 %. Назначение снижает цель по повторениям на эквивалентное число повторений и сообщает об этом; падение такого размера никогда не называется снижением и никогда не уменьшает вес.'),
    value: L('fresh < 2 sets ≤ pre-loaded · 1 % per set, max 6 %', 'на свежие силы < 2 подходов ≤ после нагрузки · 1 % за подход, не более 6 %'), basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: L('At an unchanged load an exercise loses repetitions after work for the same prime mover (bench press after machine fly about −25 %, fly after bench press about −17 % over five sets with 2-min rests; more after a fatigued limiting synergist or with 1-min rests), while total work over both exercises is similar and long-term growth does not depend on order. In index terms that is about 3–5 % after five sets; the per-set value is a practical average, not a study result.', 'При неизменном весе упражнение теряет повторения после работы на ту же основную рабочую мышцу (жим лёжа после сведений в тренажёре — около −25 %, сведения после жима лёжа — около −17 % за пять подходов с отдыхом 2 мин; больше — после утомления лимитирующего синергиста или при отдыхе 1 мин), при этом суммарная работа за оба упражнения сходна, а долгосрочный рост не зависит от порядка. В терминах индекса это около 3–5 % после пяти подходов; значение на один подход — практическое среднее, а не результат исследования.'),
    refIds: ['senna2019_bench_fly_order', 'vilacaalves2014_biceps_preexhaustion', 'miranda2010_order_rest_interaction', 'augustsson2003_preexhaustion_legpress', 'gentil2007_pecdeck_chestpress_order', 'spreuwenberg2006_squat_order', 'simao2012_exercise_order_review', 'nunes2021_exercise_order'], implementedIn: 'src/domain/preload.ts, src/domain/progression.ts, src/domain/prescription.ts',
  },
  {
    id: 'rest_default', area: 'session',
    rule: L('Logging a set starts a rest of 2:30, adjustable by −15 / +15 s at any time; an adjustment stays for that exercise for the rest of the session. The owner\'s measured rest is still recorded per set.', 'Запись подхода запускает отдых 2:30, который в любой момент можно изменить на −15 / +15 с; изменение сохраняется для этого упражнения до конца тренировки. Ваш измеренный отдых по-прежнему записывается для каждого подхода.'),
    value: L('150 s', '150 с'), basis: 'research_informed_heuristic', confidence: 'moderate', configurable: L('Settings → Rest timer', 'Настройки → Таймер отдыха'),
    rationale: L('Longer rests (about 2–3 min) preserve repetitions and volume on later sets better than 1-min rests; one fixed, visible default is easier to follow than a per-exercise number. The exact value is the owner\'s choice.', 'Более долгий отдых (около 2–3 мин) лучше сохраняет повторения и объём в следующих подходах, чем отдых 1 мин; одному постоянному видимому значению по умолчанию следовать проще, чем числу для каждого упражнения. Точное значение — ваш выбор.'), refIds: ['schoenfeld2016_rest', 'singer2024_rest', 'miranda2010_order_rest_interaction'], implementedIn: 'src/domain/liveFlow.ts, src/ui/pages/Train.tsx',
  },
  {
    id: 'log_after_set', area: 'session',
    rule: L('In a live session a set exists only once it was performed and logged; the plan is a target line. Weight is pre-filled from the same set last time while the session repeats last time\'s weights, else from the last set of this session, else from the plan; nothing pre-filled counts.', 'В тренировке в реальном времени подход существует только после того, как он выполнен и записан; план — это строка с целью. Вес подставляется из того же подхода прошлого раза, пока тренировка повторяет веса прошлого раза, иначе — из последнего подхода этой тренировки, иначе — из плана; ничто подставленное не засчитывается.'),
    value: L('no prepared sets', 'без заготовленных подходов'), basis: 'heuristic', confidence: 'high', configurable: null,
    rationale: L('Reps are not known before a set; prepared rows had to be corrected after every set and could be ticked by mistake.', 'Число повторений до подхода неизвестно; заготовленные строки приходилось исправлять после каждого подхода, и их можно было отметить по ошибке.'), refIds: [], implementedIn: 'src/domain/liveFlow.ts, src/ui/pages/Train.tsx',
  },
]);

export const RULE_BY_ID: Record<string, Rule> = byLang(() => Object.fromEntries(RULES.map((r) => [r.id, r])));
