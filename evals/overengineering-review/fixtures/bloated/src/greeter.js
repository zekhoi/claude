import leftPad from "left-pad";
import isOdd from "is-odd";

export class AbstractGreetingStrategy {
  greet(_name) {
    throw new Error("not implemented");
  }
}

export class EnglishGreetingStrategy extends AbstractGreetingStrategy {
  greet(name) {
    return `Hello, ${name}!`;
  }
}

export class GreetingStrategyFactory {
  static create(locale = "en") {
    switch (locale) {
      case "en":
        return new EnglishGreetingStrategy();
      default:
        return new EnglishGreetingStrategy();
    }
  }
}

export class GreeterConfig {
  constructor({ locale = "en", padWidth = 0, enableCache = false, retries = 0 } = {}) {
    this.locale = locale;
    this.padWidth = padWidth;
    this.enableCache = enableCache;
    this.retries = retries;
  }
}

export class Greeter {
  constructor(config = new GreeterConfig()) {
    this.config = config;
    this.strategy = GreetingStrategyFactory.create(config.locale);
    this.cache = new Map();
  }

  greet(name) {
    if (this.config.enableCache && this.cache.has(name)) return this.cache.get(name);
    const text = leftPad(this.strategy.greet(name), this.config.padWidth);
    if (this.config.enableCache) this.cache.set(name, text);
    return text;
  }

  greetMany(names) {
    const out = [];
    for (let i = 0; i < names.length; i++) {
      out.push({ text: this.greet(names[i]), odd: isOdd(i) });
    }
    return out;
  }
}
