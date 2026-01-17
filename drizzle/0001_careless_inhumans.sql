CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"database_id" integer,
	"name" text NOT NULL,
	"physical_name" text NOT NULL,
	"type" text DEFAULT 'base' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "collections_physical_name_unique" UNIQUE("physical_name")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;