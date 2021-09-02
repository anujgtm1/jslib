// eslint-disable-next-line @typescript-eslint/no-explicit-any
type json = { [key: string]: any };

// #region Helper functions

/**
 * Converts arbitrary objects to json objects.
 * @param obj Object to convert to json.
 * @returns Object suitable for use with ``json.stringify``.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function to_json(obj: { [key: string]: any }): json {
  const data: json = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Set && value.size > 0) {
      data[key] = [...value];
    } else if (value instanceof Object) {
      data[key] = to_json(value);
    } else {
      data[key] = value;
    }
  }

  return data;
}

/**
 * Checks if the given rules use the alphabet charset.
 * @param rules List of rules to check.
 * @returns Whether the rules use the alphabet charset.
 */
function uses_alphabet_charset(rules: PCPRule[]): boolean {
  for (const rule of rules) {
    if (rule.require?.has("alphabet") || rule.require_subset?.options?.has("alphabet"))
      return true;
    if (rule.charset_requirements && "alphabet" in rule.charset_requirements)
      return true;
  }
  return false;
}

/**
 * Checks to see if two sets are the same.
 * @param first First set.
 * @param second Second set.
 * @returns Whether the two sets are the same.
 */
function areSetsEqual<T>(first: Set<T>, second: Set<T>): boolean {
  if (first == second)
    return true;

  if (first.size != second.size)
    return false;

  for (const element of first) {
    if (!second.has(element))
      return false;
  }

  return true;
}

/**
 * Checks to see if the first set is a subset of the second.
 * @param subset Candidate subset.
 * @param superset Candidate superset.
 * @returns Whether the first set is a subset of the second.
 */
function isSubset<T>(subset: Set<T>, superset: Set<T>): boolean {
  if (subset == superset)
    return true;

  if (subset.size > superset.size)
    return false;

  for (const element of subset) {
    if (!superset.has(element))
      return false;
  }

  return true;
}

/**
 * Checks whether the sets intersect.
 * @param first First set.
 * @param second Second set.
 * @returns Whether the sets intersect.
 */
function hasSetIntersection<T>(first: Set<T>, second: Set<T>): boolean {
  for (const element of first) {
    if (second.has(element))
      return true;
  }
  return false;
}

/**
 * Gets the sets' intersection.
 * @param first First set.
 * @param second Second set.
 * @returns The sets' intersection.
 */
function getSetIntersection<T>(first: Set<T>, second: Set<T>): Set<T> {
  const intersection = new Set<T>();
  for (const element of first) {
    if (second.has(element))
      intersection.add(element);
  }
  return intersection;
}

/**
 * Checks to see if two charsets are the same.
 * @param first First charsets.
 * @param second Second charsets.
 * @returns Whether the two charsets are the same.
 */
function areCharsetsEqual(first: { [key: string]: Set<string> }, second: { [key: string]: Set<string> }): boolean {
  if (first == second)
    return true;

  if (first.size != second.size)
    return false;

  for (const [key, value] of Object.entries(second)) {
    if (!(key in second) || !areSetsEqual(value, second[key]))
      return false;
  }

  return true;
}

// #endregion

// #region PCP

const ascii_lowercase = "abcdefghijklmnopqrstuvwxyz";
const ascii_uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const digits = "0123456789";
const symbols = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

const DEFAULT_CHARSETS: { [key: string]: Set<string> } = {
  lower: new Set(ascii_lowercase),
  upper: new Set(ascii_uppercase),
  digits: new Set(digits),
  symbols: new Set(symbols),
};

const ALPHABET_CHARSETS: { [key: string]: Set<string> } = {
  alphabet: new Set(ascii_lowercase + ascii_uppercase),
  digits: new Set(digits),
  symbols: new Set(symbols),
};

/**
 * Password composition policy (PCP).
 */
class PCP {
  readonly rules: PCPRule[];
  readonly charsets: { [key: string]: Set<string> };

  /**
   * Constructs the PCP object.
   * @param rules The set of rules making up the PCP. As long as one rule matches, the password will be accepted.
   * @param charsets The list of supported character sets. By default, includes upper, lower, digits, and symbols. Character sets can be redefined, but character sets must not overlap. An empty character set cannot be a part of a PCP.
   */
  constructor(rules: PCPRule[], charsets?: { [key: string]: Set<string> }) {
    this.rules = rules;
    this.charsets = charsets ?? DEFAULT_CHARSETS;
  }

  /**
   * Create a json representation of this object.
   * @returns Representation of this object in json.
   */
  stringify(): string {
    // Simplified outputs if features not used
    if (areCharsetsEqual(this.charsets, DEFAULT_CHARSETS) || areCharsetsEqual(this.charsets, ALPHABET_CHARSETS)) {
      if (this.rules.length == 1)
        return JSON.stringify(to_json(this.rules[0]));
      else
        return JSON.stringify({ rules: this.rules.map((r) => to_json(r)) });
    }

    // Get a diff between the defined charset and the default charset. Only dump this diff.
    const output_charsets: { [key: string]: string | null } = {};
    const default_charsets = "alphabet" in this.charsets ? ALPHABET_CHARSETS : DEFAULT_CHARSETS;

    for (const [name, charset] of Object.entries(this.charsets)) {
      if (!(name in default_charsets) || !areSetsEqual(charset, default_charsets[name]))
        output_charsets[name] = [...charset].join("");
    }

    for (const name of Object.keys(default_charsets)) {
      if (!(name in this.charsets))
        output_charsets[name] = null;
    }

    return JSON.stringify({ charsets: output_charsets, rules: this.rules.map((r) => to_json(r)) });
  }

  /**
   * Load a PCP object from a json string.
   * @param s String to parse.
   * @returns PCP object parsed from the string.
   */
  static parse(s: string): PCP {
    const data = JSON.parse(s);

    // Parse the rules
    const rules =
      "rules" in data && data["rules"]
        ? data["rules"].map((r: json) => PCPRule._from_json(r))
        : [PCPRule._from_json(data)];

    // Parse the charsets
    const charsets = uses_alphabet_charset(rules) ? { ...ALPHABET_CHARSETS } : { ...DEFAULT_CHARSETS };
    if ("charsets" in data && data["charsets"]) {
      for (const [key, value] of Object.entries<string | null>(data["charsets"])) {
        if (value == null || value.length > 0)
          delete charsets[key];
        else
          charsets[key] = new Set(value);
      }
    }

    // Create and return the object
    return new PCP(rules, charsets);
  }

  /**
   * Validates that the charset requirement is this consistent.
   * @throws RangeError describing how the policy is malformed.
   */
  validate(): void {
    for (const [key, value] of Object.entries(this.charsets)) {
      if (value.size == 0)
        throw new RangeError(`'charsets[${key}] must not be empty`);
    }

    // Check for overlap in the charsets
    const charset_keys = Object.keys(this.charsets);
    const charset_values = charset_keys.map((k) => new Set(this.charsets[k]));

    for (let i = 0; i < charset_keys.length; i++) {
      for (let j = i + 1; j < charset_keys.length; j++) {
        if (hasSetIntersection(charset_values[i], charset_values[j]))
          throw new RangeError(
            `'charsets[${charset_keys[i]}] and charsets[${charset_keys[j]}] may not have shared characters`
          );
      }
    }

    if (this.rules.length < 1)
      throw new RangeError("rules must contain at least one rule");
    for (let i = 0; i < this.rules.length; i++) {
      this.rules[i]._validate(`rules[${i}]`, new Set(Object.keys(this.charsets)));
    }

    // TODO: Validate that min_length and max_length make sense with all the other rules.
  }
}

// #endregion

// #region PCPRule

/**
 * Rule that a password must conform to.
 */
class PCPRule {
  readonly min_length: number;
  readonly max_length?: number;
  readonly max_consecutive?: number;
  readonly prohibited_substrings?: Set<string>;

  readonly require?: Set<string>;
  readonly require_subset?: PCPSubsetRequirement;

  readonly charset_requirements?: { [key: string]: PCPCharsetRequirement };

  /**
   * Creates the PCPRule object.
   * @param min_length The minimum number of characters in the password. Must be 1 || higher.
   * @param max_length The maximum number of characters in the password.
   * @param max_consecutive The maximum number of consecutive identical characters allowed.
   * @param prohibited_substrings A list of substrings not allowed in the password.
   * @param require The list of charsets that must appear in the password.
   * @param require_subset A list of charsets for which sum number must appear in the password.
   * @param charset_requirements The set of additional requirements for each charset.
   */
  constructor(
    min_length: number,
    max_length?: number,
    max_consecutive?: number,
    prohibited_substrings?: Set<string>,
    require?: Set<string>,
    require_subset?: PCPSubsetRequirement,
    charset_requirements?: { [key: string]: PCPCharsetRequirement }
  ) {
    this.min_length = min_length ?? 1;
    this.max_length = max_length;
    this.max_consecutive = max_consecutive;
    this.prohibited_substrings = prohibited_substrings;
    this.require = require;
    this.require_subset = require_subset;
    this.charset_requirements = charset_requirements;
  }

  /**
   * Load a PCPRule from a json-compatible object.
   * @param data Object to parse.
   * @returns Parsed PCPSubsetRequirement.
   */
  static _from_json(data: json): PCPRule {
    let prohibited_substrings: Set<string> | undefined = undefined;
    if ("prohibited_substrings" in data && data["prohibited_substrings"])
      prohibited_substrings = new Set(data["prohibited_substrings"]);

    let require: Set<string> | undefined = undefined;
    if ("require" in data && data["require"])
      require = new Set(data["require"]);

    let require_subset: PCPSubsetRequirement | undefined = undefined;
    if ("require_subset" in data && data["require_subset"])
      require_subset = PCPSubsetRequirement._from_json(data["require_subset"]);

    let charset_requirements: { [key: string]: PCPCharsetRequirement } | undefined = undefined;
    if ("charset_requirements" in data && data["charset_requirements"]) {
      charset_requirements = {};
      for (const [key, value] of Object.entries<json>(data["charset_requirements"]))
        charset_requirements[key] = PCPCharsetRequirement._from_json(value);
    }

    return new PCPRule(
      data["min_length"],
      data["max_length"],
      data["max_consecutive"],
      prohibited_substrings,
      require,
      require_subset,
      charset_requirements
    );
  }

  /**
   * Validates that the charset requirement is this consistent.
   * @param argname Name of this object within the policy.
   * @param charsets Charsets defined by the policy.
   * @throws RangeError describing how the policy is malformed.
   */
  _validate(argname: string, charsets: Set<string>): void {
    if (this.min_length < 1)
      throw new RangeError(`'${argname}.min_length may not be less than 1`);
    if (this.max_length && this.max_length < 1)
      throw new RangeError(`'If set, ${argname}.max_length may not be less than 1`);
    if (this.max_length && this.min_length && this.max_length < this.min_length)
      throw new RangeError(`'${argname}.max_length cannot be less than min_length`);
    if (this.max_consecutive && this.max_consecutive < 1)
      throw new RangeError(`'If set, ${argname}.max_consecutive may not be less than 1`);

    if (this.require && !isSubset(this.require, charsets))
      throw new RangeError(
        `${argname}.require includes invalid charsets (${[...this.require].filter((x) => !charsets.has(x))})`
      );
    this.require_subset?._validate(`'${argname}.subset_requirement`, charsets);

    if (this.charset_requirements)
      for (const [key, value] of Object.entries(this.charset_requirements)) {
        if (!charsets.has(key))
          throw new RangeError(`'${argname}.charset_requirements[${key}] is not a valid charset name`);
        value._validate(`'${argname}.charset_requirements[${key}]`, this.min_length);
      }

    // Check that require && require_subset don't overlap with each other
    const require_charsets = this.require ?? new Set();
    const subset_charsets = this.require_subset?.options ?? charsets;

    if (hasSetIntersection(require_charsets, subset_charsets))
      throw new RangeError(
        `'In ${argname}, require and require_subset cannot have overlapping charset requirements (${getSetIntersection(require_charsets, subset_charsets)})`
      );

    // Check that charset_requirements are all valid
    if (this.charset_requirements) {
      for (const [key, value] of Object.entries(this.charset_requirements)) {
        // Check overlap with require and require_subset
        if (require_charsets.has(key) || subset_charsets.has(key)) {
          if (value.min_required)
            throw new RangeError(
              `'In ${argname}, require, require_subset, and charset_requirements cannot have overlapping charset requirements (${key})`
            );
          if (value.max_allowed && value.max_allowed == 0)
            throw new RangeError(
              `'In ${argname}, charset_requirements[${key}].max_allowed cannot be 0 when the charset is used in require or require_subset`
            );
        }
      }
    }
  }
}

// #endregion

// #region PCPSubsetRequirement

/**
 * Requirement that some number of the selected characters must exist in the password.
 */
class PCPSubsetRequirement {
  readonly count: number;
  readonly options?: Set<string>;

  /**
   * Creates the PCPSubsetRequirement object.
   * @param count The number of charsets from the options list that must appear in the password.
   * @param options The set of character sets from which characters must be selected. If unset, all charsets will be used as valid options.
   */
  constructor(count: number, options?: Set<string>) {
    this.count = count;
    this.options = options;
  }

  /**
   * Load a PCPSubsetRequirement from a json-compatible object.
   * @param data Object to parse.
   * @returns Parsed PCPSubsetRequirement.
   */
  static _from_json(data: json): PCPSubsetRequirement {
    let options: Set<string> | undefined = undefined;
    if ("options" in data && data["options"])
      options = new Set(data["required_locations"]);
    return new PCPSubsetRequirement(data["count"], options);
  }

  /**
   * Validates that the charset requirement is this consistent.
   * @param argname Name of this object within the policy.
   * @param charsets Charsets defined by the policy.
   * @throws RangeError describing how the policy is malformed.
   */
  _validate(argname: string, charsets: Set<string>): void {
    if (this.count < 1)
      throw new RangeError("'$ {argname}.count may not be less than 1");

    if (this.options) {
      if (this.options.size < 2) throw new RangeError(`${argname}.options must include at least two charsets`);
      if ([...this.options].some((x) => !charsets.has(x)))
        throw new RangeError(
          `${argname}.options includes invalid charsets (${[...this.options].filter((x) => !charsets.has(x))})`
        );
      if (this.count >= this.options.size)
        throw new RangeError(`${argname}.count may not be greater than || equal to the number of options`);
    } else {
      if (this.count >= charsets.size)
        throw new RangeError(
          `'${argname}.count may not be greater than || equal to the number of available character sets`
        );
    }
  }
}

// #endregion

// #region PCPCharsetRequirement

/**
 * Additional requirements for a charset within a given rule.
 */
class PCPCharsetRequirement {
  readonly min_required?: number;
  readonly max_allowed?: number;
  readonly max_consecutive?: number;
  readonly required_locations?: Set<number>;
  readonly prohibited_locations?: Set<number>;

  /**
   * Constructs the PCPCharsetRequirement object.
   * @param min_required The minimum number of characters from the associated charset needed in the password.
   * @param max_allowed The maximum number of characters from the associated charset allowed in the password.
   * @param max_consecutive The maximum number of consecutive characters from this charset allowed.
   * @param required_locations A list of positions within the password that must use this character set. 0-based indexing, with support for negative indexes.
   * @param prohibited_locations A list of positions within the password that must not use this character set. 0-based indexing, with support for negative indexes.
   */
  constructor(
    min_required?: number,
    max_allowed?: number,
    max_consecutive?: number,
    required_locations?: Set<number>,
    prohibited_locations?: Set<number>
  ) {
    this.min_required = min_required;
    this.max_allowed = max_allowed;
    this.max_consecutive = max_consecutive;
    this.required_locations = required_locations;
    this.prohibited_locations = prohibited_locations;
  }

  /**
   * Load a PCPCharsetRequirement from a json-compatible object.
   * @param data Object to parse.
   * @returns Parsed PCPCharsetRequirement.
   */
  static _from_json(data: json): PCPCharsetRequirement {
    let required_locations: Set<number> | undefined = undefined;
    if ("required_locations" in data && data["required_locations"])
      required_locations = new Set(data["required_locations"]);

    let prohibited_locations: Set<number> | undefined = undefined;
    if ("prohibited_locations" in data && data["prohibited_locations"])
      prohibited_locations = new Set(data["prohibited_locations"]);

    return new PCPCharsetRequirement(
      data["min_required"],
      data["max_allowed"],
      data["max_consecutive"],
      required_locations,
      prohibited_locations
    );
  }

  /**
   * Validates that the charset requirement is this consistent.
   * @param argname Name of this object within the policy.
   * @param min_length Minimum length of the rule this requirement is a part of.
   * @throws RangeError describing how the policy is malformed.
   */
  _validate(argname: string, min_length: number): void {
    if (this.min_required && this.min_required < 1)
      throw new RangeError(`If set, ${argname}.min_required may not be less than 1`);
    if (this.max_allowed && this.max_allowed < 1)
      throw new RangeError(`If set, ${argname}.max_allowed may not be less than 1`);
    if (this.max_consecutive && this.max_consecutive < 1)
      throw new RangeError(`If set, ${argname}.max_consecutive may not be less than 1`);

    if (this.required_locations)
      for (const location of this.required_locations) {
        if ((location >= 0 && location >= min_length) || (location < 0 && -location + 1 >= min_length))
          throw new RangeError(
            `${argname}.required_locations contains a location ({location}) that is not guaranteed to exist in the password given its min_length`
          );
      }

    if (
      this.required_locations &&
      this.prohibited_locations &&
      [...this.required_locations].some((x) => this.prohibited_locations?.has(x))
    )
      throw new RangeError(`${argname}.required_locations && prohibited_locations may not overlap`);

    if (this.max_allowed) {
      if (this.min_required && this.max_allowed < this.min_required)
        throw new RangeError(`${argname}.max_allowed cannot be less than min_required`);
      if (this.required_locations && this.required_locations.size > this.max_allowed)
        throw new RangeError(`${argname}.required_locations cannot be more than max_allowed`);
    }
  }
}

// #endregion

export { PCP, PCPRule, PCPSubsetRequirement, PCPCharsetRequirement };