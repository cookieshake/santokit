CREATE TABLE "policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"database_id" integer,
	"collection_name" text NOT NULL,
	"role" text NOT NULL,
	"action" text NOT NULL,
	"condition" text NOT NULL,
	"effect" text DEFAULT 'allow' NOT NULL,
	"created_at" timestamp DEFAULT now()
);

ALTER TABLE "policies" ADD CONSTRAINT "policies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;