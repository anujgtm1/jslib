import { PCP, PCPRule } from "./pcp_data";

/**
 * Checks whether the given password is valid for the given PCP.
 * @param password Password to validate.
 * @param pcp PCP to validate against.
 * @returns Whether the password is valid.
 */
function check_password(password: string, pcp: PCP): boolean {
  pcp.validate();

  // Map the password onto the charsets. Helpful when checking charset requirements.
  const charset_mapping: { [key: string]: number } = {};
  const charset_names = Object.keys(pcp.charsets);

  for (let i = 0; i < charset_names.length; i++) {
    charset_mapping[charset_names[i]] = i;
  }

  const mapped_password = [];
  for (const char of password) {
    let found = false;

    for (const [name, charset] of Object.entries(pcp.charsets)) {
      if (charset.has(char)) {
        mapped_password.push(charset_mapping[name]);
        found = true;
        break;
      }
    }

    // Password uses a non-allowed character
    if (!found)
      return false;
  }

  // Check each rule. Only one needs to pass for validation to succeed  
  for (const rule of pcp.rules) {
    if (check_password_against_rule(password, rule, charset_mapping, mapped_password))
      return true;
  }

  return false;
}

/**
 * Checks whether the given password is valid for the given rules.
 * @param password Password to validate.
 * @param rule Rule to validate against.
 * @param charset_mapping A mapping between charsets and indices.
 * @param mapped_password The password mapped into the charset index for each character.
 * @returns Whether the password is valid.
 */
function check_password_against_rule(
  password: string,
  rule: PCPRule,
  charset_mapping: { [key: string]: number },
  mapped_password: number[]): boolean {

  // min_length
  if (password.length < rule.min_length)
    return false;

  // max_length
  if (rule.max_length && password.length > rule.max_length)
    return false;

  // max_consecutive
  if (rule.max_consecutive) {
    let last_char = "";
    let consecutive_count = 0;

    for (const char of password) {
      if (char == last_char) {
        consecutive_count += 1;
        if (consecutive_count > rule.max_consecutive)
          return false;
      }
      else {
        last_char = char;
        consecutive_count = 1;
      }
    }
  }

  // prohibited substrings
  if (rule.prohibited_substrings && [...rule.prohibited_substrings].some(s => password.includes(s)))
    return false;

  // require
  if (rule.require && [...rule.require].some(r => !mapped_password.includes(charset_mapping[r])))
    return false;

  // require subset
  if (rule.require_subset) {
    const options =
      rule.require_subset.options ?
        [...rule.require_subset.options].map(o => charset_mapping[o]) :
        Object.values(charset_mapping);

    if (options.filter(o => mapped_password.includes(o)).length < rule.require_subset.count)
      return false;
  }

  // charset requirements
  if (rule.charset_requirements) {
    for (const [charset, requirements] of Object.entries(rule.charset_requirements)) {
      const charset_index = charset_mapping[charset];
      const charset_count = mapped_password.filter(c => c == charset_index).length;

      // min required
      if (requirements.min_required && charset_count < requirements.min_required)
        return false;

      // max allowed
      if (requirements.max_allowed && charset_count > requirements.max_allowed)
        return false;

      // max consecutive
      if (requirements.max_consecutive) {
        let consecutive_count = 0;

        for (const index of mapped_password) {
          if (index == charset_index) {
            consecutive_count += 1;
            if (consecutive_count > requirements.max_consecutive)
              return false;
          }
          else
            consecutive_count = 0;
        }
      }

      // required locations
      if (requirements.required_locations) {
        for (const location of requirements.required_locations) {
          if (
            (location >= 0 && mapped_password[location] != charset_index) ||
            (location <= 0 && mapped_password[password.length + location] != charset_index)
          )
            return false;
        }
      }

      // prohibited locations
      if (requirements.prohibited_locations) {
        for (const location of requirements.prohibited_locations) {
          const corrected_location = location >= 0 ? location : password.length + location;
          if (corrected_location >= 0 && password.length > corrected_location &&
            mapped_password[corrected_location] == charset_index)
            return false;
        }
      }

    }
  }

  // Everything checks out
  return true;
}

export { check_password };