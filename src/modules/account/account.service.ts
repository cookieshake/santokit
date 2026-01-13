import { accountRepository } from './account.repository.js'

export class AccountService {
    async createAccount(projectId: number, data: any) {
        // Here we could hash password if needed, but for now keeping it simple as per existing project patterns
        return accountRepository.create(projectId, data)
    }

    async listAccounts(projectId: number) {
        return accountRepository.findByProjectId(projectId)
    }

    async deleteAccount(id: number) {
        return accountRepository.delete(id)
    }
}

export const accountService = new AccountService()
