/* eslint-disable no-console */
import { resolve } from 'path'
import prompts from 'prompts'
import { execaCommand } from 'execa'
import c from 'kleur'
import { version } from '../package.json'
import type { Agent } from './agents'
import { agents } from './agents'
import { getDefaultAgent, getGlobalAgent } from './config'
import type { DetectOptions } from './detect'
import { detect } from './detect'
import { getVoltaPrefix, remove } from './utils'

const DEBUG_SIGN = '?'

export interface RunnerContext {
  hasLock?: boolean
  cwd?: string
}

export type Runner = (agent: Agent, args: string[], ctx?: RunnerContext) => Promise<string | undefined> | string | undefined

export async function runCli(fn: Runner, options: DetectOptions = {}) {
  // process.argv Argv 属性返回一个数组，其中包含启动 Node.js 进程时传递的命令行参数。
  const args = process.argv.slice(2).filter(Boolean)
  try {
    await run(fn, args, options)
  }
  catch (error) {
    process.exit(1)
  }
}

export async function run(fn: Runner, args: string[], options: DetectOptions = {}) {
  const debug = args.includes(DEBUG_SIGN)
  if (debug)
    remove(args, DEBUG_SIGN)
  // Cwd ()方法返回 Node.js 进程的当前工作目录。
  let cwd = process.cwd()
  let command
  // 打印版本号
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    console.log(`@antfu/ni v${version}`)
    return
  }
  // 打印帮助信息
  if (args.length === 1 && ['-h', '--help'].includes(args[0])) {
    const dash = c.dim('-')
    console.log(c.green(c.bold('@antfu/ni')) + c.dim(` use the right package manager v${version}\n`))
    console.log(`ni   ${dash}  install`)
    console.log(`nr   ${dash}  run`)
    console.log(`nx   ${dash}  execute`)
    console.log(`nu   ${dash}  upgrade`)
    console.log(`nun  ${dash}  uninstall`)
    console.log(`nci  ${dash}  clean install`)
    console.log(`na   ${dash}  agent alias`)
    console.log(c.yellow('\ncheck https://github.com/antfu/ni for more documentation.'))
    return
  }
  // 合并绝对路径
  if (args[0] === '-C') {
    // resolve()方法将一系列路径或路径段解析为一个绝对路径。
    cwd = resolve(cwd, args[1])
    args.splice(0, 2)
  }

  const isGlobal = args.includes('-g')
  // 是否包含 -g 参数
  if (isGlobal) {
    command = await fn(await getGlobalAgent(), args)
  }
  else {
    // 得到当前项目的包管理器
    let agent = await detect({ ...options, cwd }) || await getDefaultAgent()

    if (agent === 'prompt') {
      agent = (await prompts({
        name: 'agent',
        type: 'select',
        message: 'Choose the agent',
        choices: agents.filter(i => !i.includes('@')).map(value => ({ title: value, value })),
      })).agent
      if (!agent)
        return
    }
    // 得到命令 将ni命令解析成包管理命令
    command = await fn(agent as Agent, args, {
      hasLock: Boolean(agent),
      cwd,
    })
  }

  if (!command)
    return
  const voltaPrefix = getVoltaPrefix()
  if (voltaPrefix)
    command = voltaPrefix.concat(' ').concat(command)

  if (debug) {
    console.log(command)
    return
  }
  // 执行命令
  await execaCommand(command, { stdio: 'inherit', encoding: 'utf-8', cwd })
}
