export type PromptChain = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PromptChainStep = {
  id: string;
  chain_id: string;
  step_order: number;
  name: string;
  system_prompt: string;
  user_prompt_template: string;
  created_at: string;
};

export type GenerationRequest = {
  id: string;
  user_id: string | null;
  prompt: string;
  prompt_chain_id: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
};

export type Generation = {
  id: string;
  user_id: string;
  photo_path: string;
  prompt: string;
  caption: string;
  prompt_chain_id: string | null;
  created_at: string;
};

export type LLMResponse = {
  id: string;
  generation_request_id: string | null;
  prompt_chain_step_id: string | null;
  prompt_chain_step_name: string | null;
  prompt_chain_step_order: number | null;
  model_id: string | null;
  response_text: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; is_superadmin: boolean };
        Insert: { id: string; is_superadmin?: boolean };
        Update: { is_superadmin?: boolean };
        Relationships: [];
      };
      prompt_chains: {
        Row: PromptChain;
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      prompt_chain_steps: {
        Row: PromptChainStep;
        Insert: {
          id?: string;
          chain_id: string;
          step_order: number;
          name: string;
          system_prompt: string;
          user_prompt_template: string;
          created_at?: string;
        };
        Update: {
          chain_id?: string;
          step_order?: number;
          name?: string;
          system_prompt?: string;
          user_prompt_template?: string;
        };
        Relationships: [];
      };
      generation_requests: {
        Row: GenerationRequest;
        Insert: {
          id?: string;
          user_id?: string | null;
          prompt: string;
          prompt_chain_id?: string | null;
          status?: string;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          user_id?: string | null;
          prompt?: string;
          prompt_chain_id?: string | null;
          status?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      generations: {
        Row: Generation;
        Insert: {
          id?: string;
          user_id: string;
          photo_path: string;
          prompt: string;
          caption: string;
          prompt_chain_id?: string | null;
          created_at?: string;
        };
        Update: {
          prompt?: string;
          caption?: string;
          prompt_chain_id?: string | null;
        };
        Relationships: [];
      };
      llm_responses: {
        Row: LLMResponse;
        Insert: {
          id?: string;
          generation_request_id?: string | null;
          prompt_chain_step_id?: string | null;
          prompt_chain_step_name?: string | null;
          prompt_chain_step_order?: number | null;
          model_id?: string | null;
          response_text: string;
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
          created_at?: string;
        };
        Update: {
          response_text?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_current_user_superadmin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      move_prompt_chain_step: {
        Args: { target_step_id: string; direction: number };
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
