import fs from 'fs'
import path from 'path'
import { execaCommand } from 'execa'
import { findUp } from 'find-up'
import terminalLink from 'terminal-link'
import prompts from 'prompts'
import type { Agent } from './agents'
import { AGENTS, INSTALL_PAGE, LOCKS } from './agents'
import { cmdExists } from './utils'

export interface DetectOptions {
  autoInstall?: boolean
  cwd?: string
}

export async function detect({ autoInstall, cwd }: DetectOptions) {
  let agent: Agent | null = null
  // findUp 返回所找到的第一个路径(通过尊重数组的顺序)或者未定义的路径(如果没有找到)。
  // lockPath 是 lock 文件的路径
  const lockPath = await findUp(Object.keys(LOCKS), { cwd })
  // packageJsonPath 是 package.json 文件的路径
  let packageJsonPath: string | undefined

  if (lockPath)
    packageJsonPath = path.resolve(lockPath, '../package.json')
  else
    packageJsonPath = await findUp('package.json', { cwd })

  // read `packageManager` field in package.json
  if (packageJsonPath && fs.existsSync(packageJsonPath)) {
    try {
      // 读取 package.json 文件 转换为 json 对象
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      // 是否有 packageManager 字段
      if (typeof pkg.packageManager === 'string') {
        // 拿到 packageManager 的名称 和 版本号
        const [name, version] = pkg.packageManager.split('@')
        if (name === 'yarn' && parseInt(version) > 1)
          agent = 'yarn@berry'
        else if (name === 'pnpm' && parseInt(version) < 7)
          agent = 'pnpm@6'
        else if (name in AGENTS)
          agent = name
        else
          console.warn('[ni] Unknown packageManager:', pkg.packageManager)
      }
    }
    catch {}
  }

  // detect based on lock
  // 没有 package.json 文件 或者 没有 packageManager 字段 时候，通过 lock 文件来检测
  if (!agent && lockPath)
    agent = LOCKS[path.basename(lockPath)]

  // auto install
  if (agent && !cmdExists(agent.split('@')[0])) {
    if (!autoInstall) {
      console.warn(`[ni] Detected ${agent} but it doesn't seem to be installed.\n`)

      if (process.env.CI)
        process.exit(1)
      const link = terminalLink(agent, INSTALL_PAGE[agent])
      const { tryInstall } = await prompts({
        name: 'tryInstall',
        type: 'confirm',
        message: `Would you like to globally install ${link}?`,
      })
      if (!tryInstall)
        process.exit(1)
    }

    await execaCommand(`npm i -g ${agent}`, { stdio: 'inherit', cwd })
  }

  return agent
}
