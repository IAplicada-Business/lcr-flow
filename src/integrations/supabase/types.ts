export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conciliacoes: {
        Row: {
          competencia: string
          concluido_em: string | null
          created_at: string
          divergencias_count: number
          empresa_id: string
          id: string
          status: Database["public"]["Enums"]["conciliacao_status"]
          updated_at: string
        }
        Insert: {
          competencia: string
          concluido_em?: string | null
          created_at?: string
          divergencias_count?: number
          empresa_id: string
          id?: string
          status?: Database["public"]["Enums"]["conciliacao_status"]
          updated_at?: string
        }
        Update: {
          competencia?: string
          concluido_em?: string | null
          created_at?: string
          divergencias_count?: number
          empresa_id?: string
          id?: string
          status?: Database["public"]["Enums"]["conciliacao_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_bancarias: {
        Row: {
          agencia: string
          banco: string
          conta: string
          created_at: string
          empresa_id: string
          id: string
        }
        Insert: {
          agencia: string
          banco: string
          conta: string
          created_at?: string
          empresa_id: string
          id?: string
        }
        Update: {
          agencia?: string
          banco?: string
          conta?: string
          created_at?: string
          empresa_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string | null
          competencia: string
          created_at: string
          dados_extraidos: Json
          empresa_id: string
          id: string
          origem: Database["public"]["Enums"]["documento_origem"]
          recebido_em: string
          responsavel_id: string | null
          status: Database["public"]["Enums"]["documento_status"]
          tipo: Database["public"]["Enums"]["documento_tipo"]
          updated_at: string
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          competencia: string
          created_at?: string
          dados_extraidos?: Json
          empresa_id: string
          id?: string
          origem?: Database["public"]["Enums"]["documento_origem"]
          recebido_em?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["documento_status"]
          tipo: Database["public"]["Enums"]["documento_tipo"]
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          competencia?: string
          created_at?: string
          dados_extraidos?: Json
          empresa_id?: string
          id?: string
          origem?: Database["public"]["Enums"]["documento_origem"]
          recebido_em?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["documento_status"]
          tipo?: Database["public"]["Enums"]["documento_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_esperados: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          obrigatorio: boolean
          tipo: Database["public"]["Enums"]["documento_tipo"]
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          obrigatorio?: boolean
          tipo: Database["public"]["Enums"]["documento_tipo"]
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          obrigatorio?: boolean
          tipo?: Database["public"]["Enums"]["documento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "documentos_esperados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cnpj: string
          consultor_id: string | null
          created_at: string
          id: string
          is_demo: boolean
          nome_fantasia: string | null
          razao_social: string
          regime: Database["public"]["Enums"]["regime_tributario"]
          segmento: string | null
          status: Database["public"]["Enums"]["empresa_status"]
          tags: string[]
          updated_at: string
        }
        Insert: {
          cnpj: string
          consultor_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          nome_fantasia?: string | null
          razao_social: string
          regime?: Database["public"]["Enums"]["regime_tributario"]
          segmento?: string | null
          status?: Database["public"]["Enums"]["empresa_status"]
          tags?: string[]
          updated_at?: string
        }
        Update: {
          cnpj?: string
          consultor_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          nome_fantasia?: string | null
          razao_social?: string
          regime?: Database["public"]["Enums"]["regime_tributario"]
          segmento?: string | null
          status?: Database["public"]["Enums"]["empresa_status"]
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_consultor_id_fkey"
            columns: ["consultor_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes: {
        Row: {
          atualizado_em: string
          config: Json
          id: string
          status: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          config?: Json
          id?: string
          status?: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          config?: Json
          id?: string
          status?: string
          tipo?: string
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          competencia: string
          created_at: string
          empresa_id: string
          id: string
          importado_em: string | null
          planilha_url: string | null
          status: Database["public"]["Enums"]["lancamento_status"]
          total_lancamentos: number
          updated_at: string
        }
        Insert: {
          competencia: string
          created_at?: string
          empresa_id: string
          id?: string
          importado_em?: string | null
          planilha_url?: string | null
          status?: Database["public"]["Enums"]["lancamento_status"]
          total_lancamentos?: number
          updated_at?: string
        }
        Update: {
          competencia?: string
          created_at?: string
          empresa_id?: string
          id?: string
          importado_em?: string | null
          planilha_url?: string | null
          status?: Database["public"]["Enums"]["lancamento_status"]
          total_lancamentos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          concluido_em: string | null
          consultor_id: string | null
          created_at: string
          empresa_id: string
          id: string
          ordem: number
          prazo: string | null
          status: Database["public"]["Enums"]["tarefa_status"]
          tipo: Database["public"]["Enums"]["tarefa_tipo"]
          titulo: string
          updated_at: string
        }
        Insert: {
          concluido_em?: string | null
          consultor_id?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          ordem?: number
          prazo?: string | null
          status?: Database["public"]["Enums"]["tarefa_status"]
          tipo: Database["public"]["Enums"]["tarefa_tipo"]
          titulo: string
          updated_at?: string
        }
        Update: {
          concluido_em?: string | null
          consultor_id?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          ordem?: number
          prazo?: string | null
          status?: Database["public"]["Enums"]["tarefa_status"]
          tipo?: Database["public"]["Enums"]["tarefa_tipo"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_consultor_id_fkey"
            columns: ["consultor_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_perfil: {
        Row: {
          ativo: boolean
          created_at: string
          email: string | null
          id: string
          nome: string
          perfil: Database["public"]["Enums"]["perfil_usuario"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          perfil?: Database["public"]["Enums"]["perfil_usuario"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          perfil?: Database["public"]["Enums"]["perfil_usuario"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      conciliacao_status:
        | "nao_iniciada"
        | "em_andamento"
        | "divergencias"
        | "concluida"
      documento_origem: "gestta" | "manual"
      documento_status:
        | "recebido"
        | "classificado"
        | "processado"
        | "conciliado"
      documento_tipo:
        | "extrato"
        | "nf_entrada"
        | "nf_saida"
        | "fatura_cartao"
        | "recibo"
        | "darf"
        | "planilha_financeira"
        | "movimento_contabil"
      empresa_status:
        | "em_dia"
        | "cobranca"
        | "lancamento"
        | "conciliacao"
        | "entregue"
        | "atrasado"
      lancamento_status: "gerada" | "upload_leveldrive" | "importada_sci"
      perfil_usuario: "admin" | "consultor" | "assistente"
      regime_tributario: "simples" | "presumido" | "real" | "mei"
      tarefa_status: "now" | "doing" | "next" | "back" | "done"
      tarefa_tipo: "cobranca" | "lancamentos" | "conciliacao"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      conciliacao_status: [
        "nao_iniciada",
        "em_andamento",
        "divergencias",
        "concluida",
      ],
      documento_origem: ["gestta", "manual"],
      documento_status: [
        "recebido",
        "classificado",
        "processado",
        "conciliado",
      ],
      documento_tipo: [
        "extrato",
        "nf_entrada",
        "nf_saida",
        "fatura_cartao",
        "recibo",
        "darf",
        "planilha_financeira",
        "movimento_contabil",
      ],
      empresa_status: [
        "em_dia",
        "cobranca",
        "lancamento",
        "conciliacao",
        "entregue",
        "atrasado",
      ],
      lancamento_status: ["gerada", "upload_leveldrive", "importada_sci"],
      perfil_usuario: ["admin", "consultor", "assistente"],
      regime_tributario: ["simples", "presumido", "real", "mei"],
      tarefa_status: ["now", "doing", "next", "back", "done"],
      tarefa_tipo: ["cobranca", "lancamentos", "conciliacao"],
    },
  },
} as const
