import { it, expect } from 'vitest';
import { getFlowContext } from './context.ts';
import type { FlowContext } from './global-setup.ts';

export interface FlowStep {
    run(ctx: FlowContext, store: Record<string, any>): Promise<any>;
}

type BaseUrlProvider = (ctx: FlowContext) => string;

class RequestStepBuilder implements FlowStep {
    private checks: ((res: Response, store?: any) => Promise<void> | void)[] = [];
    private captureName?: string;
    private headersBuilders: ((store: any) => Record<string, string>)[] = [];

    constructor(private method: string, private urlPath: string, private baseUrlProvider: BaseUrlProvider, private body?: any | ((store: any) => any)) { }

    expectStatus(status: number) {
        this.checks.push(async (res) => {
            if (res.status !== status) {
                const bodyText = await res.clone().text().catch(() => '');
                const details = bodyText ? ` Response: ${bodyText}` : '';
                expect(res.status, `Expected status ${status} but got ${res.status}.${details}`).toBe(status);
                return;
            }
            expect(res.status, `Expected status ${status} but got ${res.status}`).toBe(status);
        });
        return this;
    }

    expectHeader(name: string, value: string | RegExp) {
        this.checks.push((res) => {
            const val = res.headers.get(name);
            if (value instanceof RegExp) {
                expect(val).toMatch(value);
            } else {
                expect(val).toBe(value);
            }
        });
        return this;
    }

    expectBody(expected: any) {
        this.checks.push(async (res) => {
            const clone = res.clone();
            const json = await clone.json();
            expect(json).toEqual(expected);
        });
        return this;
    }

    expectBodyPartial(partial: any) {
        this.checks.push(async (res) => {
            const clone = res.clone();
            const json = await clone.json();
            expect(json).toMatchObject(partial);
        });
        return this;
    }

    as(name: string) {
        this.captureName = name;
        return this;
    }

    inspectBody(inspector: (json: any) => void | Promise<void>) {
        this.checks.push(async (res) => {
            const clone = res.clone();
            const json = await clone.json();
            await inspector(json);
        });
        return this;
    }

    expectErrorMatches(matcher: string | RegExp) {
        this.checks.push(async (res) => {
            expect(res.status).toBeGreaterThanOrEqual(400);
            const clone = res.clone();
            const json = await clone.json();
            const errorVal = json?.error;
            let message = '';
            if (typeof errorVal === 'string') {
                message = errorVal;
            } else if (errorVal?.message) {
                message = String(errorVal.message);
            } else {
                message = JSON.stringify(errorVal ?? json);
            }
            if (typeof matcher === 'string') {
                expect(message).toContain(matcher);
            } else {
                expect(message).toMatch(matcher);
            }
        });
        return this;
    }

    withHeader(name: string, valueProvider: string | ((store: any) => string)) {
        this.headersBuilders.push(store => {
            const val = typeof valueProvider === 'function' ? valueProvider(store) : valueProvider;
            return { [name]: val };
        });
        return this;
    }

    withBearerToken(tokenProvider: (store: any) => string) {
        return this.withHeader('Authorization', store => `Bearer ${tokenProvider(store)}`);
    }

    async run(ctx: FlowContext, store: Record<string, any>) {
        const baseUrl = this.baseUrlProvider(ctx);
        const url = `${baseUrl}${this.urlPath.startsWith('/') ? '' : '/'}${this.urlPath}`;

        const extraHeaders: Record<string, string> = {};
        for (const builder of this.headersBuilders) {
            Object.assign(extraHeaders, builder(store));
        }

        let bodyData = this.body;
        if (typeof this.body === 'function') {
            bodyData = this.body(store);
        }

        const options: RequestInit = {
            method: this.method,
            headers: { 'Content-Type': 'application/json', ...extraHeaders },
            body: bodyData ? JSON.stringify(bodyData) : undefined,
        };
        const res = await fetch(url, options);

        for (const check of this.checks) {
            await check(res, store);
        }

        if (this.captureName) {
            const clone = res.clone();
            try {
                store[this.captureName] = await clone.json();
            } catch {
                store[this.captureName] = await clone.text();
            }
        }

        return res;
    }
}

export function requestApi(method: string, path: string, body?: any) {
    return new RequestStepBuilder(method, path, (ctx) => ctx.apiUrl, body);
}

export function requestHub(method: string, path: string, body?: any) {
    return new RequestStepBuilder(method, path, (ctx) => ctx.hubUrl, body);
}

// Alias for backward compatibility if user liked "requestToHub" name but meant general request
export const requestToHub = requestApi;

export function commandCli(command: string | ((ctx: FlowContext) => string)): FlowStep {
    return {
        async run(ctx: FlowContext, store: Record<string, any>) {
            const cmdStr = typeof command === 'function' ? command(ctx) : command;
            await ctx.runCli(cmdStr);
        }
    };
}

export function ensureLogic(): FlowStep {
    return {
        async run(ctx) {
            await ctx.ensureLogicApplied();
        }
    }
}


export function ensureProject(): FlowStep {
    return {
        async run(ctx) {
            await ctx.ensureProjectPrepared();
        }
    }
}


class ExecStepBuilder implements FlowStep {
    private checks: ((res: { exitCode: number, output: string }) => void)[] = [];

    constructor(private commandProvider: string | ((ctx: FlowContext) => string)) { }

    expectSuccess() {
        this.checks.push(res => {
            expect(res.exitCode).toBe(0);
        });
        return this;
    }

    expectOutput(matcher: string | RegExp) {
        this.checks.push(res => {
            expect(res.output).toMatch(matcher instanceof RegExp ? matcher : new RegExp(matcher)); // Simple match or strict?
            // User used .toContain which is partial match. 
            if (typeof matcher === 'string') {
                expect(res.output).toContain(matcher);
            } else {
                expect(res.output).toMatch(matcher);
            }
        });
        return this;
    }

    async run(ctx: FlowContext, store: Record<string, any>) {
        const cmdStr = typeof this.commandProvider === 'function' ? this.commandProvider(ctx) : this.commandProvider;
        const res = await ctx.execInClient(cmdStr);

        for (const check of this.checks) {
            check(res);
        }
        return res;
    }
}

export function execInClient(command: string | ((ctx: FlowContext) => string)) {
    return new ExecStepBuilder(command).expectSuccess();
}



export function testFlow(name: string, ...steps: FlowStep[]) {
    it(name, async () => {
        const ctx = getFlowContext();
        const store = {};
        for (const step of steps) {
            await step.run(ctx, store);
        }
    }, 60000);
}
