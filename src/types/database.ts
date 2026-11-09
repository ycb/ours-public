
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_event_acknowledgements": {
                  Row: {
                    "acknowledged_at": string,"activity_event_id": string,"couple_id": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string,"activity_event_id": string,"couple_id": string,"member_id": string
                  }
                  Update: {
                    "acknowledged_at"?: string,"activity_event_id"?: string,"couple_id"?: string,"member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_event_ack_event_fkey"
      columns: ["activity_event_id","couple_id"]
isOneToOne: false
      referencedRelation: "activity_events"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "activity_event_ack_member_fkey"
      columns: ["member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "activity_event_acknowledgements_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_events": {
                  Row: {
                    "actor_member_id": string,"comment_id": string | null,"couple_id": string,"created_at": string,"draw_id": string | null,"event_type": Database["public"]['Enums']["activity_event_type"],"id": string,"item_id": string | null,"memory_id": string | null,"metadata": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_member_id": string,"comment_id"?: string | null,"couple_id": string,"created_at"?: string,"draw_id"?: string | null,"event_type": Database["public"]['Enums']["activity_event_type"],"id"?: string,"item_id"?: string | null,"memory_id"?: string | null,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "actor_member_id"?: string,"comment_id"?: string | null,"couple_id"?: string,"created_at"?: string,"draw_id"?: string | null,"event_type"?: Database["public"]['Enums']["activity_event_type"],"id"?: string,"item_id"?: string | null,"memory_id"?: string | null,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_actor_fkey"
      columns: ["actor_member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "activity_events_comment_fkey"
      columns: ["comment_id","couple_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "activity_events_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_draw_fkey"
      columns: ["draw_id","couple_id"]
isOneToOne: false
      referencedRelation: "roulette_draws"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "activity_events_item_fkey"
      columns: ["item_id","couple_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "activity_events_memory_fkey"
      columns: ["memory_id","couple_id"]
isOneToOne: false
      referencedRelation: "memories"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "archived_at": string | null,"couple_id": string,"created_at": string,"created_by_member_id": string,"id": string,"name": string,"request_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"couple_id": string,"created_at"?: string,"created_by_member_id": string,"id"?: string,"name": string,"request_id": string,"sort_order"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"couple_id"?: string,"created_at"?: string,"created_by_member_id"?: string,"id"?: string,"name"?: string,"request_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_creator_fkey"
      columns: ["created_by_member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_member_id": string,"body": string,"couple_id": string,"created_at": string,"id": string,"item_id": string,"kind": Database["public"]['Enums']["comment_kind"],"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_member_id": string,"body": string,"couple_id": string,"created_at"?: string,"id"?: string,"item_id": string,"kind"?: Database["public"]['Enums']["comment_kind"],"request_id": string
                  }
                  Update: {
                    "author_member_id"?: string,"body"?: string,"couple_id"?: string,"created_at"?: string,"id"?: string,"item_id"?: string,"kind"?: Database["public"]['Enums']["comment_kind"],"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_fkey"
      columns: ["author_member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "comments_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_item_fkey"
      columns: ["item_id","couple_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"couples": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"item_responses": {
                  Row: {
                    "couple_id": string,"created_at": string,"id": string,"interest": Database["public"]['Enums']["interest"] | null,"is_favorite": boolean,"item_id": string,"member_id": string,"roulette_decision": Database["public"]['Enums']["roulette_decision"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "couple_id": string,"created_at"?: string,"id"?: string,"interest"?: Database["public"]['Enums']["interest"] | null,"is_favorite"?: boolean,"item_id": string,"member_id": string,"roulette_decision"?: Database["public"]['Enums']["roulette_decision"],"updated_at"?: string
                  }
                  Update: {
                    "couple_id"?: string,"created_at"?: string,"id"?: string,"interest"?: Database["public"]['Enums']["interest"] | null,"is_favorite"?: boolean,"item_id"?: string,"member_id"?: string,"roulette_decision"?: Database["public"]['Enums']["roulette_decision"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_responses_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_responses_item_fkey"
      columns: ["item_id","couple_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "item_responses_member_fkey"
      columns: ["member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"item_revisions": {
                  Row: {
                    "category_id": string,"couple_id": string,"created_at": string,"description": string,"editor_member_id": string,"id": string,"item_id": string,"revision_number": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"couple_id": string,"created_at"?: string,"description": string,"editor_member_id": string,"id"?: string,"item_id": string,"revision_number": number,"title": string
                  }
                  Update: {
                    "category_id"?: string,"couple_id"?: string,"created_at"?: string,"description"?: string,"editor_member_id"?: string,"id"?: string,"item_id"?: string,"revision_number"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_revisions_category_fkey"
      columns: ["category_id","couple_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "item_revisions_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_revisions_editor_fkey"
      columns: ["editor_member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "item_revisions_item_fkey"
      columns: ["item_id","couple_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"item_views": {
                  Row: {
                    "couple_id": string,"first_seen_at": string,"item_id": string,"last_seen_at": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "couple_id": string,"first_seen_at"?: string,"item_id": string,"last_seen_at"?: string,"member_id": string
                  }
                  Update: {
                    "couple_id"?: string,"first_seen_at"?: string,"item_id"?: string,"last_seen_at"?: string,"member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_views_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_views_item_fkey"
      columns: ["item_id","couple_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "item_views_member_fkey"
      columns: ["member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"items": {
                  Row: {
                    "archived_at": string | null,"category_id": string,"couple_id": string,"created_at": string,"creator_member_id": string,"description": string,"id": string,"request_id": string,"source_item_id": string | null,"source_memory_id": string | null,"status": Database["public"]['Enums']["item_status"],"submitted_at": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"category_id": string,"couple_id": string,"created_at"?: string,"creator_member_id": string,"description": string,"id"?: string,"request_id": string,"source_item_id"?: string | null,"source_memory_id"?: string | null,"status"?: Database["public"]['Enums']["item_status"],"submitted_at"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"category_id"?: string,"couple_id"?: string,"created_at"?: string,"creator_member_id"?: string,"description"?: string,"id"?: string,"request_id"?: string,"source_item_id"?: string | null,"source_memory_id"?: string | null,"status"?: Database["public"]['Enums']["item_status"],"submitted_at"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_category_fkey"
      columns: ["category_id","couple_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "items_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_creator_fkey"
      columns: ["creator_member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "items_source_item_fkey"
      columns: ["source_item_id","couple_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "items_source_memory_fkey"
      columns: ["source_memory_id","couple_id"]
isOneToOne: false
      referencedRelation: "memories"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"members": {
                  Row: {
                    "auth_user_id": string,"couple_id": string,"created_at": string,"display_name": string,"id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id": string,"couple_id": string,"created_at"?: string,"display_name": string,"id"?: string,"sort_order": number
                  }
                  Update: {
                    "auth_user_id"?: string,"couple_id"?: string,"created_at"?: string,"display_name"?: string,"id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    }
                  ]
                },"memories": {
                  Row: {
                    "author_member_id": string,"body": string,"couple_id": string,"created_at": string,"draw_id": string | null,"highlight": string | null,"id": string,"item_id": string,"next_time": Database["public"]['Enums']["memory_next_time"] | null,"refinement": string | null,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_member_id": string,"body": string,"couple_id": string,"created_at"?: string,"draw_id"?: string | null,"highlight"?: string | null,"id"?: string,"item_id": string,"next_time"?: Database["public"]['Enums']["memory_next_time"] | null,"refinement"?: string | null,"request_id": string
                  }
                  Update: {
                    "author_member_id"?: string,"body"?: string,"couple_id"?: string,"created_at"?: string,"draw_id"?: string | null,"highlight"?: string | null,"id"?: string,"item_id"?: string,"next_time"?: Database["public"]['Enums']["memory_next_time"] | null,"refinement"?: string | null,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memories_author_fkey"
      columns: ["author_member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "memories_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memories_draw_fkey"
      columns: ["draw_id","couple_id"]
isOneToOne: false
      referencedRelation: "roulette_draws"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "memories_item_fkey"
      columns: ["item_id","couple_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"claimed_at": string | null,"couple_id": string,"created_at": string,"id": string,"kind": Database["public"]['Enums']["notification_kind"],"last_error_code": string | null,"not_before": string,"recipient_member_id": string,"sealed_at": string | null,"sent_at": string | null,"suppressed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"claimed_at"?: string | null,"couple_id": string,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["notification_kind"],"last_error_code"?: string | null,"not_before": string,"recipient_member_id": string,"sealed_at"?: string | null,"sent_at"?: string | null,"suppressed_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"claimed_at"?: string | null,"couple_id"?: string,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["notification_kind"],"last_error_code"?: string | null,"not_before"?: string,"recipient_member_id"?: string,"sealed_at"?: string | null,"sent_at"?: string | null,"suppressed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_outbox_recipient_fkey"
      columns: ["recipient_member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"notification_outbox_events": {
                  Row: {
                    "activity_event_id": string,"couple_id": string,"outbox_id": string,"suppressed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_event_id": string,"couple_id": string,"outbox_id": string,"suppressed_at"?: string | null
                  }
                  Update: {
                    "activity_event_id"?: string,"couple_id"?: string,"outbox_id"?: string,"suppressed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_events_event_fkey"
      columns: ["activity_event_id","couple_id"]
isOneToOne: false
      referencedRelation: "activity_events"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "notification_outbox_events_outbox_fkey"
      columns: ["outbox_id","couple_id"]
isOneToOne: false
      referencedRelation: "notification_outbox"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"reflection_reminders": {
                  Row: {
                    "attempts": number,"claimed_at": string | null,"couple_id": string,"created_at": string,"draw_id": string,"last_error_code": string | null,"member_id": string,"sent_at": string | null,"suppressed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"claimed_at"?: string | null,"couple_id": string,"created_at"?: string,"draw_id": string,"last_error_code"?: string | null,"member_id": string,"sent_at"?: string | null,"suppressed_at"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"claimed_at"?: string | null,"couple_id"?: string,"created_at"?: string,"draw_id"?: string,"last_error_code"?: string | null,"member_id"?: string,"sent_at"?: string | null,"suppressed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reflection_reminders_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reflection_reminders_draw_fkey"
      columns: ["draw_id","couple_id"]
isOneToOne: false
      referencedRelation: "roulette_draws"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "reflection_reminders_member_fkey"
      columns: ["member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                },"roulette_draws": {
                  Row: {
                    "cancelled_at": string | null,"couple_id": string,"created_at": string,"done_at": string | null,"drawn_by_member_id": string,"filter_category_id": string | null,"id": string,"item_id": string,"outcome": Database["public"]['Enums']["draw_outcome"],"planned_when": string | null,"reflect_after": string | null,"request_id": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"couple_id": string,"created_at"?: string,"done_at"?: string | null,"drawn_by_member_id": string,"filter_category_id"?: string | null,"id"?: string,"item_id": string,"outcome": Database["public"]['Enums']["draw_outcome"],"planned_when"?: string | null,"reflect_after"?: string | null,"request_id": string,"source"?: string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"couple_id"?: string,"created_at"?: string,"done_at"?: string | null,"drawn_by_member_id"?: string,"filter_category_id"?: string | null,"id"?: string,"item_id"?: string,"outcome"?: Database["public"]['Enums']["draw_outcome"],"planned_when"?: string | null,"reflect_after"?: string | null,"request_id"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roulette_draws_actor_fkey"
      columns: ["drawn_by_member_id","couple_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "roulette_draws_couple_id_fkey"
      columns: ["couple_id"]
isOneToOne: false
      referencedRelation: "couples"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roulette_draws_filter_category_fkey"
      columns: ["filter_category_id","couple_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","couple_id"]
    },{
      foreignKeyName: "roulette_draws_item_fkey"
      columns: ["item_id","couple_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","couple_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_comment":
{ Args: { "p_body": string,"p_item_id": string,"p_request_id": string }; Returns: {
              "author_member_id": string,
"body": string,
"couple_id": string,
"created_at": string,
"id": string,
"item_id": string,
"kind": Database["public"]['Enums']["comment_kind"],
"request_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "comments"
        isOneToOne: true
        isSetofReturn: false
      } },
"add_memory":
{ Args: { "p_body": string,"p_draw_id": string,"p_highlight": string,"p_item_id": string,"p_next_time": Database["public"]['Enums']["memory_next_time"],"p_refinement": string,"p_request_id": string }; Returns: {
              "author_member_id": string,
"body": string,
"couple_id": string,
"created_at": string,
"draw_id": string | null,
"highlight": string | null,
"id": string,
"item_id": string,
"next_time": Database["public"]['Enums']["memory_next_time"] | null,
"refinement": string | null,
"request_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "memories"
        isOneToOne: true
        isSetofReturn: false
      } },
"archive_item":
{ Args: { "p_item_id": string }; Returns: {
              "archived_at": string | null,
"category_id": string,
"couple_id": string,
"created_at": string,
"creator_member_id": string,
"description": string,
"id": string,
"request_id": string,
"source_item_id": string | null,
"source_memory_id": string | null,
"status": Database["public"]['Enums']["item_status"],
"submitted_at": string | null,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"can_read_item":
{ Args: { "target_item_id": string }; Returns: boolean
                           },
"cancel_draw":
{ Args: { "p_draw_id": string }; Returns: {
              "cancelled_at": string | null,
"couple_id": string,
"created_at": string,
"done_at": string | null,
"drawn_by_member_id": string,
"filter_category_id": string | null,
"id": string,
"item_id": string,
"outcome": Database["public"]['Enums']["draw_outcome"],
"planned_when": string | null,
"reflect_after": string | null,
"request_id": string,
"source": string
            }
                          SetofOptions: {
        from: "*"
        to: "roulette_draws"
        isOneToOne: true
        isSetofReturn: false
      } },
"claim_notifications":
{ Args: { "p_limit": number }; Returns: {
              "id": string,"kind": Database["public"]['Enums']["notification_kind"],"recipient_email": string
            }[]
                           },
"claim_reflection_reminders":
{ Args: { "p_limit": number }; Returns: {
              "draw_id": string,"member_id": string,"recipient_email": string
            }[]
                           },
"create_category":
{ Args: { "p_name": string,"p_request_id": string }; Returns: {
              "archived_at": string | null,
"couple_id": string,
"created_at": string,
"created_by_member_id": string,
"id": string,
"name": string,
"request_id": string,
"sort_order": number
            }
                          SetofOptions: {
        from: "*"
        to: "categories"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_item":
{ Args: { "p_category_id": string,"p_description": string,"p_request_id": string,"p_source_item_id"?: string,"p_source_memory_id"?: string,"p_title": string }; Returns: {
              "archived_at": string | null,
"category_id": string,
"couple_id": string,
"created_at": string,
"creator_member_id": string,
"description": string,
"id": string,
"request_id": string,
"source_item_id": string | null,
"source_memory_id": string | null,
"status": Database["public"]['Enums']["item_status"],
"submitted_at": string | null,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_member_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"date_when_check":
{ Args: { "p_when": string }; Returns: undefined
                           },
"decline_item":
{ Args: { "p_item_id": string,"p_reason": string,"p_request_id": string }; Returns: {
              "couple_id": string,
"created_at": string,
"id": string,
"interest": Database["public"]['Enums']["interest"] | null,
"is_favorite": boolean,
"item_id": string,
"member_id": string,
"roulette_decision": Database["public"]['Enums']["roulette_decision"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_responses"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_item":
{ Args: { "p_item_id": string }; Returns: boolean
                           },
"draw_roulette":
{ Args: { "p_favorites_only"?: boolean,"p_filter_category_id"?: string }; Returns: {
              "archived_at": string | null,
"category_id": string,
"couple_id": string,
"created_at": string,
"creator_member_id": string,
"description": string,
"id": string,
"request_id": string,
"source_item_id": string | null,
"source_memory_id": string | null,
"status": Database["public"]['Enums']["item_status"],
"submitted_at": string | null,
"title": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_current_member":
{ Args: Record<PropertyKey, never>; Returns: {
              "auth_user_id": string,
"couple_id": string,
"created_at": string,
"display_name": string,
"id": string,
"sort_order": number
            }
                          SetofOptions: {
        from: "*"
        to: "members"
        isOneToOne: true
        isSetofReturn: false
      } },
"is_current_couple":
{ Args: { "target_couple_id": string }; Returns: boolean
                           },
"mark_draw_done":
{ Args: { "p_draw_id": string }; Returns: {
              "cancelled_at": string | null,
"couple_id": string,
"created_at": string,
"done_at": string | null,
"drawn_by_member_id": string,
"filter_category_id": string | null,
"id": string,
"item_id": string,
"outcome": Database["public"]['Enums']["draw_outcome"],
"planned_when": string | null,
"reflect_after": string | null,
"request_id": string,
"source": string
            }
                          SetofOptions: {
        from: "*"
        to: "roulette_draws"
        isOneToOne: true
        isSetofReturn: false
      } },
"mark_item_seen":
{ Args: { "p_item_id": string }; Returns: {
              "couple_id": string,
"first_seen_at": string,
"item_id": string,
"last_seen_at": string,
"member_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_views"
        isOneToOne: true
        isSetofReturn: false
      } },
"mark_item_seen_through_events":
{ Args: { "p_activity_event_ids": (string)[],"p_item_id": string }; Returns: {
              "couple_id": string,
"first_seen_at": string,
"item_id": string,
"last_seen_at": string,
"member_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_views"
        isOneToOne: true
        isSetofReturn: false
      } },
"mark_notification_failed":
{ Args: { "p_code": string,"p_id": string }; Returns: undefined
                           },
"mark_notification_sent":
{ Args: { "p_id": string }; Returns: undefined
                           },
"mark_reflection_reminder_failed":
{ Args: { "p_code": string,"p_draw_id": string,"p_member_id": string }; Returns: undefined
                           },
"mark_reflection_reminder_sent":
{ Args: { "p_draw_id": string,"p_member_id": string }; Returns: undefined
                           },
"open_date_for_actor":
{ Args: { "p_draw_id": string }; Returns: {
              "cancelled_at": string | null,
"couple_id": string,
"created_at": string,
"done_at": string | null,
"drawn_by_member_id": string,
"filter_category_id": string | null,
"id": string,
"item_id": string,
"outcome": Database["public"]['Enums']["draw_outcome"],
"planned_when": string | null,
"reflect_after": string | null,
"request_id": string,
"source": string
            }
                          SetofOptions: {
        from: "*"
        to: "roulette_draws"
        isOneToOne: true
        isSetofReturn: false
      } },
"pass_item":
{ Args: { "p_item_id": string,"p_note": string,"p_request_id": string }; Returns: {
              "archived_at": string | null,
"category_id": string,
"couple_id": string,
"created_at": string,
"creator_member_id": string,
"description": string,
"id": string,
"request_id": string,
"source_item_id": string | null,
"source_memory_id": string | null,
"status": Database["public"]['Enums']["item_status"],
"submitted_at": string | null,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"plan_item":
{ Args: { "p_item_id": string,"p_reflect_after": string,"p_request_id": string,"p_when": string }; Returns: {
              "cancelled_at": string | null,
"couple_id": string,
"created_at": string,
"done_at": string | null,
"drawn_by_member_id": string,
"filter_category_id": string | null,
"id": string,
"item_id": string,
"outcome": Database["public"]['Enums']["draw_outcome"],
"planned_when": string | null,
"reflect_after": string | null,
"request_id": string,
"source": string
            }
                          SetofOptions: {
        from: "*"
        to: "roulette_draws"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_roulette_outcome":
{ Args: { "p_filter_category_id": string,"p_item_id": string,"p_outcome": Database["public"]['Enums']["draw_outcome"],"p_request_id": string }; Returns: {
              "cancelled_at": string | null,
"couple_id": string,
"created_at": string,
"done_at": string | null,
"drawn_by_member_id": string,
"filter_category_id": string | null,
"id": string,
"item_id": string,
"outcome": Database["public"]['Enums']["draw_outcome"],
"planned_when": string | null,
"reflect_after": string | null,
"request_id": string,
"source": string
            }
                          SetofOptions: {
        from: "*"
        to: "roulette_draws"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_draw_when":
{ Args: { "p_draw_id": string,"p_reflect_after": string,"p_when": string }; Returns: {
              "cancelled_at": string | null,
"couple_id": string,
"created_at": string,
"done_at": string | null,
"drawn_by_member_id": string,
"filter_category_id": string | null,
"id": string,
"item_id": string,
"outcome": Database["public"]['Enums']["draw_outcome"],
"planned_when": string | null,
"reflect_after": string | null,
"request_id": string,
"source": string
            }
                          SetofOptions: {
        from: "*"
        to: "roulette_draws"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_item_favorite":
{ Args: { "p_favorite": boolean,"p_item_id": string }; Returns: {
              "couple_id": string,
"created_at": string,
"id": string,
"interest": Database["public"]['Enums']["interest"] | null,
"is_favorite": boolean,
"item_id": string,
"member_id": string,
"roulette_decision": Database["public"]['Enums']["roulette_decision"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_responses"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_item_interest":
{ Args: { "p_interest": Database["public"]['Enums']["interest"],"p_item_id": string }; Returns: {
              "couple_id": string,
"created_at": string,
"id": string,
"interest": Database["public"]['Enums']["interest"] | null,
"is_favorite": boolean,
"item_id": string,
"member_id": string,
"roulette_decision": Database["public"]['Enums']["roulette_decision"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_responses"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_roulette_decision":
{ Args: { "p_decision": Database["public"]['Enums']["roulette_decision"],"p_item_id": string }; Returns: {
              "couple_id": string,
"created_at": string,
"id": string,
"interest": Database["public"]['Enums']["interest"] | null,
"is_favorite": boolean,
"item_id": string,
"member_id": string,
"roulette_decision": Database["public"]['Enums']["roulette_decision"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_responses"
        isOneToOne: true
        isSetofReturn: false
      } },
"submit_item":
{ Args: { "p_item_id": string }; Returns: {
              "archived_at": string | null,
"category_id": string,
"couple_id": string,
"created_at": string,
"creator_member_id": string,
"description": string,
"id": string,
"request_id": string,
"source_item_id": string | null,
"source_memory_id": string | null,
"status": Database["public"]['Enums']["item_status"],
"submitted_at": string | null,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_item":
{ Args: { "p_category_id": string,"p_description": string,"p_expected_updated_at"?: string,"p_item_id": string,"p_title": string }; Returns: {
              "archived_at": string | null,
"category_id": string,
"couple_id": string,
"created_at": string,
"creator_member_id": string,
"description": string,
"id": string,
"request_id": string,
"source_item_id": string | null,
"source_memory_id": string | null,
"status": Database["public"]['Enums']["item_status"],
"submitted_at": string | null,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "activity_event_type": "item_created"|"item_edited"|"item_remixed"|"response_changed"|"roulette_decision_changed"|"item_became_eligible"|"comment_added"|"draw_accepted"|"draw_deferred"|"memory_added"|"item_declined"|"item_passed","comment_kind": "message"|"not_now_reason","draw_outcome": "accepted"|"deferred","interest": "low"|"curious"|"into_it"|"very_into_it","item_status": "draft"|"submitted","memory_next_time": "repeat"|"refine","notification_kind": "idea_shared"|"activity_digest","roulette_decision": "pending"|"ready"|"not_now"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "activity_event_type": ["item_created", "item_edited", "item_remixed", "response_changed", "roulette_decision_changed", "item_became_eligible", "comment_added", "draw_accepted", "draw_deferred", "memory_added", "item_declined", "item_passed"],"comment_kind": ["message", "not_now_reason"],"draw_outcome": ["accepted", "deferred"],"interest": ["low", "curious", "into_it", "very_into_it"],"item_status": ["draft", "submitted"],"memory_next_time": ["repeat", "refine"],"notification_kind": ["idea_shared", "activity_digest"],"roulette_decision": ["pending", "ready", "not_now"]
          }
        }
} as const
