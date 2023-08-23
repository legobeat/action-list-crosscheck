import jq from '@elastic/micro-jq';
// eslint-disable-next-line @typescript-eslint/no-shadow
import { fetch } from 'undici';

// TODO: input validation
/* eslint-disable @typescript-eslint/no-non-null-assertion */

/**
 * Example function that returns a greeting for the given name.
 *
 * @param name - The name to greet.
 * @returns The greeting.
 */
export default function greeter(name: string): string {
  return `Hello, ${name}!`;
}

type CutParserSpec = {
  delimiter: string;
  field: number;
};
type JqParserSpec = {
  path: string;
};
type SplitParserSpec = {
  delimiter: string;
};

export type ParserSpec = {
  cut?: CutParserSpec;
  jq?: JqParserSpec;
  split?: SplitParserSpec;
};

export type ListSpec = {
  name: string;
  url: string;
  parsers: ParserSpec[];
};

export type ListParser = {
  transform(input: string): string[];
};

export class SplitTransformer implements ListParser {
  #delimiter: string;

  constructor(spec: SplitParserSpec) {
    this.#delimiter = spec.delimiter;
  }

  transform(input: string) {
    return input.split(this.#delimiter);
  }
}

export class CutTransformer implements ListParser {
  #delimiter: string;

  #field: number;

  constructor(spec: CutParserSpec) {
    this.#delimiter = spec.delimiter;
    this.#field = spec.field;
  }

  transform(input: string) {
    return [input.split(this.#delimiter)[this.#field]!];
  }
}

export class JqTransformer implements ListParser {
  #path: string;

  constructor(spec: JqParserSpec) {
    this.#path = spec.path;
  }

  transform(input: string) {
    const result = jq.executeScript(JSON.parse(input), this.#path);
    if (Array.isArray(result)) {
      return result as string[];
    }
    throw new Error(`Invalid return type ${typeof result} in JqTransformer`);
  }
}

/**
 * Fetches and parses a list of string from an external HTTP edpoint according to supplied spec.
 *
 * @param listSpec - Configuration of source and transformation.
 * @returns Parsed output.
 */
export async function fetchList(listSpec: ListSpec): Promise<string[]> {
  const body = await (await fetch(listSpec.url)).text();
  return parseList(listSpec.parsers, body);
}

/**
 * Passes input through transformers in sequence according to spec.
 *
 * @param specs - Transformer specification.
 * @param input - String to parse.
 * @returns Parsed output.
 */
export function parseList(specs: ParserSpec[], input: string) {
  let result: string[] = [input];
  for (const spec of specs) {
    const parser = getParserFromSpec(spec);
    result = result
      .flatMap((entry) => parser.transform(entry))
      .filter((entry) => entry.length);
  }
  return result;
}

/**
 * Construct a transforming parser from spec.
 *
 * @param spec - Transformer spec.
 * @returns A ListParser instance.
 */
export function getParserFromSpec(spec: ParserSpec): ListParser {
  for (const key of Object.keys(spec)) {
    switch (key) {
      case 'split':
        return new SplitTransformer(spec[key]!);
      case 'cut':
        return new CutTransformer(spec[key]!);
      case 'jq':
        return new JqTransformer(spec[key]!);
      default:
        throw new Error(`Invalid transformer key ${JSON.stringify(key)}`);
    }
  }
  throw new Error(`Invalid ParserSpec "${JSON.stringify(spec)}"`);
}
