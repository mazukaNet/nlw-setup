import dayjs from "dayjs";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./lib/prisma";

export async function appRoutes(app: FastifyInstance) {
    app.post("/habits", async (request) => {
        const createHabitBody = z.object({
            // passei a validaçao
            title: z.string(),
            weekDays: z.array(z.number().min(0).max(6)),
        });

        const { title, weekDays } = createHabitBody.parse(request.body);

        const today = dayjs().startOf("day").toDate(); // retorna horas zeradas para data

        await prisma.habit.create({
            data: {
                title,
                created_at: today,
                weekDays: {
                    create: weekDays.map((weekDay) => {
                        return {
                            week_day: weekDay,
                        };
                    }),
                },
            },
        });
    });
    app.get("/day", async (request) => {
        const getDayParams = z.object({
            date: z.coerce.date(),
        });
        const { date } = getDayParams.parse(request.query);
        const parsedDate = dayjs(date).startOf("day");
        const weekDay = dayjs(date).get("day");

        // todos hábitos possiveis
        // hábitos que já foram completados

        const possibleHabits = await prisma.habit.findMany({
            where: {
                created_at: {
                    lte: date,
                },
                weekDays: {
                    some: {
                        week_day: weekDay,
                    },
                },
            },
        });

        const day = await prisma.day.findUnique({
            where: {
                date: parsedDate.toDate(),
            },
            include: {
                dayHabits: true,
            },
        });

        const completedHabits = day?.dayHabits.map((dayHabit) => {
            return dayHabit.habit_id;
        });

        return { possibleHabits, completedHabits };
    });

    app.patch("/habits/:id/toggle", async (request) => {
        const toggleHabitParams = z.object({
            id: z.string().uuid(),
        });
        const { id } = toggleHabitParams.parse(request.params);

        const today = dayjs().startOf("day").toDate();

        let day = await prisma.day.findUnique({
            where: {
                date: today,
            },
        });

        if (!day) {
            day = await prisma.day.create({
                data: {
                    date: today,
                },
            });
        }

        const dayHabit = await prisma.dayHabit.findUnique({
            where: {
                day_id_habit_id: {
                    day_id: day.id,
                    habit_id: id,
                },
            },
        });

        if (dayHabit) {
            // remover marcacao
            await prisma.dayHabit.delete({
                where: {
                    id: dayHabit.id,
                },
            });
        } else {
            // completar habito
            await prisma.dayHabit.create({
                data: {
                    day_id: day.id,
                    habit_id: id,
                },
            });
        }
    });

    app.get("/summary", async () => {
        // [{ date: 17/01, amount: 5, completed: 1}, { date: 18/01, amount: 3, completed: 2}, { date: 19/01, amount: 2, completed: 1}]
        // Query mais complexa, mais condicoes, relacionamentos = SQL na mão (RAW)
        // Prisma ORM: RAW SQL => SQLite (somente comandos no banco específico)

        const summary = await prisma.$queryRaw`
          SELECT 
            D.id, 
            D.date, 
            (
                SELECT 
                    cast(count(*)  as float)
                FROM day_habits DH
                WHERE DH.day_id = D.id
            ) as completed,
            (
                SELECT
                    cast(count(*) as float)
                FROM habit_week_days HWD
                JOIN habits H
                    ON H.id = HWD.habit_id
                WHERE 
                    HWD.week_day = cast(strftime('%w',D.date/1000.0, 'unixepoch') as int)
                    AND H.created_at <=D.date
            ) as amount
          FROM days D
        `;

        return summary;
    });
}
