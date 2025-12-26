import { type User, type InsertUser, type Diagnostico, type InsertDiagnostico } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  saveDiagnostico(data: InsertDiagnostico): Promise<Diagnostico>;
  getDiagnostico(id: number): Promise<Diagnostico | undefined>;
  listDiagnosticos(limit?: number): Promise<Diagnostico[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private diagnosticos: Map<number, Diagnostico>;
  private diagnosticoIdCounter: number;

  constructor() {
    this.users = new Map();
    this.diagnosticos = new Map();
    this.diagnosticoIdCounter = 1;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async saveDiagnostico(data: InsertDiagnostico): Promise<Diagnostico> {
    const id = this.diagnosticoIdCounter++;
    const diagnostico: Diagnostico = {
      ...data,
      id,
      data: new Date(),
    };
    this.diagnosticos.set(id, diagnostico);
    return diagnostico;
  }

  async getDiagnostico(id: number): Promise<Diagnostico | undefined> {
    return this.diagnosticos.get(id);
  }

  async listDiagnosticos(limit: number = 50): Promise<Diagnostico[]> {
    return Array.from(this.diagnosticos.values())
      .sort((a, b) => b.data.getTime() - a.data.getTime())
      .slice(0, limit);
  }
}

export const storage = new MemStorage();
