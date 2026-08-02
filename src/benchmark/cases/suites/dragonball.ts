import { defineBenchmarkCases } from '../types.js';

const FORMAT_TEMPLATE = `\n\nFormat your final answer as:\n\n- Explanation: <explanation>\n\n- Exact Answer: <answer>\n\n- Confidence: <percentage>`;

export const DRAGONBALL_BENCHMARK_CASES = defineBenchmarkCases([
  {
    id: 'test_dragonball_easy_goku_saiyan_name',
    name: 'Dragon Ball Web Search (Easy: Saiyan Birth Name)',
    category: 'real_web_search',
    prompt:
      `Background Clues (Context):\nThis Saiyan warrior arrives on Earth at the beginning of Dragon Ball Z wearing a Scouter, and reveals he is the older brother of Son Goku. Before his defeat, he discloses Goku's original alien birth name.\n\nQuestion:\nWhat is Goku's Saiyan birth name?${FORMAT_TEMPLATE}`,
    expectedTool: 'web_search',
    expectedResponseSubstrings: ['Kakarot'],
    description:
      'Easy Dragon Ball trivia web search testing identification of Goku\'s Saiyan birth name (Kakarot).',
    objective: 'Tests basic web search and factual answer extraction for an iconic anime trivia query.',
    requiredOutput: 'Answer containing Kakarot.',
    evaluationCriteria: 'Decided strictly based on whether Exact Answer contains Kakarot.',
  },
  {
    id: 'test_dragonball_medium_roshi_alias',
    name: 'Dragon Ball Web Search (Medium: Tournament Pseudonym)',
    category: 'real_web_search',
    prompt:
      `Background Clues (Context):\nThis martial arts master invented the Kamehameha wave. To keep his students Goku and Krillin humble, he entered the 21st World Martial Arts Tournament in a hairpiece disguise so they wouldn't win too easily.\n\nQuestion:\nWhat pseudonym did he use during the tournament?${FORMAT_TEMPLATE}`,
    expectedTool: 'web_search',
    expectedResponseSubstrings: ['Jackie Chun'],
    description:
      'Medium Dragon Ball trivia web search testing extraction of Master Roshi\'s tournament alias.',
    objective: 'Tests targeted web search and precise entity name retrieval.',
    requiredOutput: 'Answer containing Jackie Chun.',
    evaluationCriteria: 'Decided strictly based on whether Exact Answer contains Jackie Chun.',
  },
  {
    id: 'test_dragonball_hard_ultra_instinct',
    name: 'Dragon Ball Web Search (Hard: Transformation & Deity)',
    category: 'real_web_search',
    prompt:
      `Background Clues (Context):\nDuring the Tournament of Power arc in Dragon Ball Super, Goku unlocks a state of autonomous reaction taught by Whis that lets his body dodge and attack without conscious thought.\n\nQuestion:\nWhat is the official English name of this ultimate form, and which God of Destruction stands up in respect when Goku first achieves its complete form?${FORMAT_TEMPLATE}`,
    expectedToolSequence: ['web_search'],
    expectedResponseSubstrings: ['Ultra Instinct', 'Beerus'],
    description:
      'Hard multi-part Dragon Ball Super web search requiring identification of Ultra Instinct and God of Destruction Beerus.',
    objective: 'Tests multi-fact web search retrieval and compound criteria verification.',
    requiredOutput: 'Answer containing Ultra Instinct and Beerus.',
    evaluationCriteria: 'Decided strictly based on whether Exact Answer contains both Ultra Instinct and Beerus.',
  },
  {
    id: 'test_dragonball_obscure_ultra_ego_chapter',
    name: 'Dragon Ball Web Search (Obscure: Ultra Ego Debut Chapter)',
    category: 'real_web_search',
    prompt:
      `Background Clues (Context):\nIn the Dragon Ball Super manga Granolah the Survivor Arc, Vegeta unveils a new form powered by Destruction energy taught to him by Beerus.\n\nQuestion:\nIn which exact manga chapter number does Vegeta first name this form 'Ultra Ego', and what is the official English title of that specific chapter?${FORMAT_TEMPLATE}`,
    expectedToolSequence: ['web_search'],
    expectedResponseSubstrings: ['75', 'God of Destruction Power'],
    description:
      'Obscure Dragon Ball Super manga query requiring exact chapter number (75) and official chapter title (God of Destruction Power).',
    objective: 'Tests specific manga chapter verification and precise title retrieval.',
    requiredOutput: 'Answer containing chapter 75 and God of Destruction Power.',
    evaluationCriteria: 'Decided strictly based on whether Exact Answer contains 75 and God of Destruction Power.',
  },
  {
    id: 'test_dragonball_obscure_super_hero_release',
    name: 'Dragon Ball Web Search (Obscure: Movie Cyberattack Delay)',
    category: 'real_web_search',
    prompt:
      `Background Clues (Context):\nThe 2022 CG anime movie Dragon Ball Super: Super Hero was originally scheduled for a theatrical release in Japan on April 22, 2022, but was postponed due to a cyberattack on Toei Animation's servers.\n\nQuestion:\nWhat was the exact revised Japan theatrical release date (Month, Day, and Year) for Dragon Ball Super: Super Hero?${FORMAT_TEMPLATE}`,
    expectedToolSequence: ['web_search'],
    expectedResponseSubstrings: ['June 11, 2022'],
    description:
      'Obscure real-world production query requiring exact delayed release date (June 11, 2022).',
    objective: 'Tests real-world production history lookup.',
    requiredOutput: 'Answer containing June 11, 2022.',
    evaluationCriteria: 'Decided strictly based on whether Exact Answer contains June 11, 2022.',
  },
  {
    id: 'test_dragonball_obscure_gt_ending_theme',
    name: 'Dragon Ball Web Search (Obscure: GT Ending Theme 1)',
    category: 'real_web_search',
    prompt:
      `Background Clues (Context):\nThe anime series Dragon Ball GT aired from 1996 to 1997. The very first ending theme song (used for Episodes 1 through 26) was a popular Japanese rock track.\n\nQuestion:\nWhat is the title of this first ending theme song, and what is the name of the Japanese rock band that performed it?${FORMAT_TEMPLATE}`,
    expectedToolSequence: ['web_search'],
    expectedResponseSubstrings: ['Hitori', 'DEEN'],
    description:
      'Obscure anime soundtrack query requiring first ending theme title (Hitori ja Nai) and band (DEEN).',
    objective: 'Tests music/soundtrack metadata retrieval.',
    requiredOutput: 'Answer containing Hitori ja Nai and DEEN.',
    evaluationCriteria: 'Decided strictly based on whether Exact Answer contains Hitori and DEEN.',
  },
]);
