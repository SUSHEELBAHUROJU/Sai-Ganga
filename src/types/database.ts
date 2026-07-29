export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      factory_waste_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          notes: string | null
          quantity_kg: number
          scrap_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          quantity_kg: number
          scrap_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          quantity_kg?: number
          scrap_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_waste_entries_scrap_type_id_fkey"
            columns: ["scrap_type_id"]
            isOneToOne: false
            referencedRelation: "scrap_stock"
            referencedColumns: ["scrap_type_id"]
          },
          {
            foreignKeyName: "factory_waste_entries_scrap_type_id_fkey"
            columns: ["scrap_type_id"]
            isOneToOne: false
            referencedRelation: "scrap_types"
            referencedColumns: ["id"]
          },
        ]
      }
      low_stock_thresholds: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          item_type: string
          min_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          item_type: string
          min_quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          item_type?: string
          min_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      opening_balances: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          item_type: string
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          item_type: string
          quantity: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          item_type?: string
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipe_products: {
        Row: {
          created_at: string
          created_by: string | null
          diameter_inches: number
          id: string
          is_active: boolean
          updated_at: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          diameter_inches: number
          id?: string
          is_active?: boolean
          updated_at?: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          diameter_inches?: number
          id?: string
          is_active?: boolean
          updated_at?: string
          weight_kg?: number
        }
        Relationships: []
      }
      production_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          notes: string | null
          pipe_product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          pipe_product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          pipe_product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_entries_pipe_product_id_fkey"
            columns: ["pipe_product_id"]
            isOneToOne: false
            referencedRelation: "finished_goods_stock"
            referencedColumns: ["pipe_product_id"]
          },
          {
            foreignKeyName: "production_entries_pipe_product_id_fkey"
            columns: ["pipe_product_id"]
            isOneToOne: false
            referencedRelation: "pipe_products"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_material_purchases: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string | null
          entry_date: string
          entry_mode: string
          id: string
          notes: string | null
          num_bags: number | null
          pack_kg: number | null
          raw_material_type_id: string
          supplier_name: string | null
          total_qty_kg: number
          updated_at: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_mode: string
          id?: string
          notes?: string | null
          num_bags?: number | null
          pack_kg?: number | null
          raw_material_type_id: string
          supplier_name?: string | null
          total_qty_kg: number
          updated_at?: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_mode?: string
          id?: string
          notes?: string | null
          num_bags?: number | null
          pack_kg?: number | null
          raw_material_type_id?: string
          supplier_name?: string | null
          total_qty_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_purchases_raw_material_type_id_fkey"
            columns: ["raw_material_type_id"]
            isOneToOne: false
            referencedRelation: "raw_material_stock"
            referencedColumns: ["raw_material_type_id"]
          },
          {
            foreignKeyName: "raw_material_purchases_raw_material_type_id_fkey"
            columns: ["raw_material_type_id"]
            isOneToOne: false
            referencedRelation: "raw_material_types"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_material_types: {
        Row: {
          created_at: string
          created_by: string | null
          default_pack_kg: number | null
          id: string
          is_active: boolean
          is_recycled_output: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_pack_kg?: number | null
          id?: string
          is_active?: boolean
          is_recycled_output?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_pack_kg?: number | null
          id?: string
          is_active?: boolean
          is_recycled_output?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      recycling_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          notes: string | null
          num_bags: number | null
          output_entry_mode: string | null
          output_mode: string
          output_pack_kg: number | null
          pipe_product_id: string | null
          pipe_quantity: number | null
          scrap_consumed_kg: number | null
          source_scrap_type_id: string
          total_output_kg: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          num_bags?: number | null
          output_entry_mode?: string | null
          output_mode: string
          output_pack_kg?: number | null
          pipe_product_id?: string | null
          pipe_quantity?: number | null
          scrap_consumed_kg?: number | null
          source_scrap_type_id: string
          total_output_kg?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          num_bags?: number | null
          output_entry_mode?: string | null
          output_mode?: string
          output_pack_kg?: number | null
          pipe_product_id?: string | null
          pipe_quantity?: number | null
          scrap_consumed_kg?: number | null
          source_scrap_type_id?: string
          total_output_kg?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recycling_entries_pipe_product_id_fkey"
            columns: ["pipe_product_id"]
            isOneToOne: false
            referencedRelation: "finished_goods_stock"
            referencedColumns: ["pipe_product_id"]
          },
          {
            foreignKeyName: "recycling_entries_pipe_product_id_fkey"
            columns: ["pipe_product_id"]
            isOneToOne: false
            referencedRelation: "pipe_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recycling_entries_source_scrap_type_id_fkey"
            columns: ["source_scrap_type_id"]
            isOneToOne: false
            referencedRelation: "scrap_stock"
            referencedColumns: ["scrap_type_id"]
          },
          {
            foreignKeyName: "recycling_entries_source_scrap_type_id_fkey"
            columns: ["source_scrap_type_id"]
            isOneToOne: false
            referencedRelation: "scrap_types"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_entries: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          entry_date: string
          id: string
          notes: string | null
          pipe_product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          pipe_product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          pipe_product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_pipe_product_id_fkey"
            columns: ["pipe_product_id"]
            isOneToOne: false
            referencedRelation: "finished_goods_stock"
            referencedColumns: ["pipe_product_id"]
          },
          {
            foreignKeyName: "sales_entries_pipe_product_id_fkey"
            columns: ["pipe_product_id"]
            isOneToOne: false
            referencedRelation: "pipe_products"
            referencedColumns: ["id"]
          },
        ]
      }
      scrap_dealers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scrap_purchases: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          notes: string | null
          quantity_kg: number
          scrap_dealer_id: string | null
          scrap_type_id: string
          updated_at: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          quantity_kg: number
          scrap_dealer_id?: string | null
          scrap_type_id: string
          updated_at?: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          quantity_kg?: number
          scrap_dealer_id?: string | null
          scrap_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrap_purchases_scrap_dealer_id_fkey"
            columns: ["scrap_dealer_id"]
            isOneToOne: false
            referencedRelation: "scrap_dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrap_purchases_scrap_type_id_fkey"
            columns: ["scrap_type_id"]
            isOneToOne: false
            referencedRelation: "scrap_stock"
            referencedColumns: ["scrap_type_id"]
          },
          {
            foreignKeyName: "scrap_purchases_scrap_type_id_fkey"
            columns: ["scrap_type_id"]
            isOneToOne: false
            referencedRelation: "scrap_types"
            referencedColumns: ["id"]
          },
        ]
      }
      scrap_types: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      finished_goods_stock: {
        Row: {
          current_stock: number | null
          diameter_inches: number | null
          is_active: boolean | null
          is_low_stock: boolean | null
          low_stock_threshold: number | null
          opening_qty: number | null
          pipe_product_id: string | null
          produced_qty: number | null
          recycled_produced_qty: number | null
          sold_qty: number | null
          weight_kg: number | null
        }
        Relationships: []
      }
      raw_material_stock: {
        Row: {
          current_stock: number | null
          is_active: boolean | null
          is_low_stock: boolean | null
          is_recycled_output: boolean | null
          low_stock_threshold: number | null
          name: string | null
          opening_kg: number | null
          purchased_kg: number | null
          raw_material_type_id: string | null
          recycled_output_kg: number | null
        }
        Relationships: []
      }
      scrap_stock: {
        Row: {
          consumed_kg: number | null
          current_stock: number | null
          factory_waste_kg: number | null
          is_active: boolean | null
          is_low_stock: boolean | null
          low_stock_threshold: number | null
          name: string | null
          opening_kg: number | null
          purchased_kg: number | null
          scrap_type_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_production_quantity: {
        Args: {
          p_entry_date: string
          p_notes?: string
          p_pipe_product_id: string
          p_quantity: number
        }
        Returns: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          notes: string | null
          pipe_product_id: string
          quantity: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "production_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_recycling_direct_to_pipe: {
        Args: {
          p_entry_date: string
          p_notes?: string
          p_pipe_product_id: string
          p_pipe_quantity: number
          p_scrap_consumed_kg?: number
          p_source_scrap_type_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          notes: string | null
          num_bags: number | null
          output_entry_mode: string | null
          output_mode: string
          output_pack_kg: number | null
          pipe_product_id: string | null
          pipe_quantity: number | null
          scrap_consumed_kg: number | null
          source_scrap_type_id: string
          total_output_kg: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "recycling_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_sales_quantity: {
        Args: {
          p_customer_id: string
          p_entry_date: string
          p_notes?: string
          p_pipe_product_id: string
          p_quantity: number
        }
        Returns: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          entry_date: string
          id: string
          notes: string | null
          pipe_product_id: string
          quantity: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

