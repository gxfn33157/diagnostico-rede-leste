import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Diagnostic results schema
export const diagnosticos = pgTable("diagnosticos", {
  id: serial("id").primaryKey(),
  dominio: text("dominio").notNull(),
  escopo: text("escopo").notNull(),
  limite: integer("limite").notNull(),
  data: timestamp("data").defaultNow().notNull(),
  resumo: text("resumo").notNull(),
  resultados: jsonb("resultados").notNull(),
  totalProbes: integer("total_probes").notNull(),
});

export const insertDiagnosticoSchema = createInsertSchema(diagnosticos).omit({
  id: true,
  data: true,
});

export type InsertDiagnostico = z.infer<typeof insertDiagnosticoSchema>;
export type Diagnostico = typeof diagnosticos.$inferSelect;

// Probe result interface for JSON storage
export interface ProbeResult {
  probe_id: number;
  region: string;
  ip: string;
  asn: string;
  isp: string;
  acessibilidade: string; // "Acessível", "Tempo lento", "Inacessível - Problema interno", etc
  latencia: string;
  velocidade: "Rápida" | "Normal" | "Lenta"; // Classificação
  perda_pacotes: string; // "0%", "1-5%", ">5%"
  certificado_ssl: string; // "Válido", "Inválido", "Não verificado"
  status: "OK" | "AVISO" | "ERRO";
}
