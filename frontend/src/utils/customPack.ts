export type CustomQuestion = {
  text: string
  correct_answer: string
  incorrect_answers: string[]
}

type ParseResult = {
  questions: CustomQuestion[]
  errors: string[]
}

const MAX_QUESTIONS = 25

/**
 * Parse a host's pasted pack into structured questions.
 *
 * Format (one per line, comments start with #):
 *   Question text? | Correct answer | Wrong 1 | Wrong 2 | Wrong 3
 *
 * The first answer after the question is the correct one. At least one
 * wrong answer is required; up to ten are accepted.
 */
export function parseCustomPack(raw: string): ParseResult {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  const questions: CustomQuestion[] = []
  const errors: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const parts = line.split('|').map((p) => p.trim())
    if (parts.length < 3) {
      errors.push(`Line ${i + 1}: needs at least question | correct | wrong`)
      continue
    }
    const [text, correct, ...incorrect] = parts
    if (!text || !correct || incorrect.some((a) => !a)) {
      errors.push(`Line ${i + 1}: empty field`)
      continue
    }
    if (text.length > 500) {
      errors.push(`Line ${i + 1}: question is too long`)
      continue
    }
    if (correct.length > 256 || incorrect.some((a) => a.length > 256)) {
      errors.push(`Line ${i + 1}: an answer is too long`)
      continue
    }
    questions.push({
      text,
      correct_answer: correct,
      incorrect_answers: incorrect,
    })
  }

  if (questions.length > MAX_QUESTIONS) {
    errors.push(
      `Only the first ${MAX_QUESTIONS} questions will be used (got ${questions.length}).`,
    )
  }

  return { questions: questions.slice(0, MAX_QUESTIONS), errors }
}
