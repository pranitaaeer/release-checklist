
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { Pool } from "pg";
import { createResolvers, typeDefs } from "./schema.js";
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

const steps = [
  "Review pull requests",
  "Merge release branch",
  "Run automated tests",
  "Check environment variables",
  "Verify database migrations",
  "Build production bundle",
  "Deploy to staging",
  "Run smoke tests",
  "Deploy to production",
  "Verify production health",
];

// const typeDefs = `#graphql
//   type Release {
//     id: ID!
//     name: String!
//     date: String!
//     additionalInfo: String!
//     completedSteps: [Int!]!
//     status: String!
//   }

//   type Query {
//     releases: [Release!]!
//     release(id: ID!): Release
//     checklistSteps: [String!]!
//   }

//   type Mutation {
//     createRelease(name: String!, date: String!, additionalInfo: String): Release!
//     updateRelease(id: ID!, name: String, date: String, additionalInfo: String): Release!
//     toggleStep(id: ID!, stepIndex: Int!, completed: Boolean!): Release!
//     deleteRelease(id: ID!): Boolean!
//   }
// `;

function formatRelease(row: any) {
  const completedSteps: number[] = row.completed_steps ?? [];
  return {
    id: String(row.id),
    name: row.name,
    date: row.release_date.toISOString
      ? row.release_date.toISOString().slice(0, 10)
      : String(row.release_date).slice(0, 10),
    additionalInfo: row.additional_info ?? "",
    completedSteps,
    status:
      completedSteps.length === 0
        ? "planned"
        : completedSteps.length === steps.length
          ? "done"
          : "ongoing",
  };
}

async function getRelease(id: string) {
  const result = await pool.query(
    "SELECT * FROM releases WHERE id = $1",
    [id],
  );
  if (!result.rows[0]) throw new Error("Release not found");
  return formatRelease(result.rows[0]);
}

const resolvers = {
  Query: {
    releases: async () => {
      const result = await pool.query(
        "SELECT * FROM releases ORDER BY release_date ASC, id DESC",
      );
      return result.rows.map(formatRelease);
    },
    release: async (_: unknown, { id }: { id: string }) => {
      const result = await pool.query(
        "SELECT * FROM releases WHERE id = $1",
        [id],
      );
      return result.rows[0] ? formatRelease(result.rows[0]) : null;
    },
    checklistSteps: () => steps,
  },

  Mutation: {
    createRelease: async (
      _: unknown,
      args: { name: string; date: string; additionalInfo?: string },
    ) => {
      if (!args.name.trim()) throw new Error("Release name is required");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
        throw new Error("Date must use YYYY-MM-DD format");
      }

      const result = await pool.query(
        `INSERT INTO releases (name, release_date, additional_info)
         VALUES ($1, $2, $3) RETURNING *`,
        [args.name.trim(), args.date, args.additionalInfo ?? ""],
      );
      return formatRelease(result.rows[0]);
    },

    updateRelease: async (
      _: unknown,
      args: {
        id: string;
        name?: string;
        date?: string;
        additionalInfo?: string;
      },
    ) => {
      const current = await pool.query(
        "SELECT * FROM releases WHERE id = $1",
        [args.id],
      );
      if (!current.rows[0]) throw new Error("Release not found");

      const row = current.rows[0];
      const result = await pool.query(
        `UPDATE releases
         SET name = $2, release_date = $3, additional_info = $4
         WHERE id = $1 RETURNING *`,
        [
          args.id,
          args.name === undefined ? row.name : args.name.trim(),
          args.date ?? String(row.release_date).slice(0, 10),
          args.additionalInfo ?? row.additional_info ?? "",
        ],
      );
      return formatRelease(result.rows[0]);
    },

    toggleStep: async (
      _: unknown,
      args: { id: string; stepIndex: number; completed: boolean },
    ) => {
      if (args.stepIndex < 0 || args.stepIndex >= steps.length) {
        throw new Error("Invalid checklist step");
      }

      const current = await pool.query(
        "SELECT completed_steps FROM releases WHERE id = $1",
        [args.id],
      );
      if (!current.rows[0]) throw new Error("Release not found");

      let completed: number[] = current.rows[0].completed_steps ?? [];
      completed = args.completed
        ? [...new Set([...completed, args.stepIndex])]
        : completed.filter((index) => index !== args.stepIndex);

      await pool.query(
        "UPDATE releases SET completed_steps = $2::jsonb WHERE id = $1",
        [args.id, JSON.stringify(completed)],
      );
      return getRelease(args.id);
    },

    deleteRelease: async (_: unknown, { id }: { id: string }) => {
      const result = await pool.query(
        "DELETE FROM releases WHERE id = $1",
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  },
};

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS releases (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      release_date DATE NOT NULL,
      additional_info TEXT NOT NULL DEFAULT '',
      completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const server = new ApolloServer({
  typeDefs,
  resolvers: createResolvers(pool),
});;
  await server.start();

  app.use(
    "/graphql",
    cors(),
    express.json(),
    expressMiddleware(server),
  );

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`GraphQL API ready at http://localhost:${port}/graphql`);
  });
}

main().catch((error) => {
  console.error("Backend startup failed:", error);
  process.exit(1);
});
