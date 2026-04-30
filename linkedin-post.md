Been exploring generative UI interfaces lately, especially for creating dashboards from natural language prompts.

There are already great tools for analytics: Power BI, Tableau, Looker, etc. But there is still this gap I keep running into where someone just wants to inspect model data quickly, without first learning a new dashboarding tool or setting up a full BI workflow.

So I built a small prototype around that idea.

It starts as a chat interface with prompt suggestions. You describe the kind of dashboard you want, and the app generates a dashboard for the Autodesk showcase model: filters, KPIs, charts, tables, and an embedded APS / Autodesk Viewer as a first-class part of the layout.

The useful part is that the dashboard is not just static output. The charts and tables are linked back to the 3D model. Clicking a chart segment or table row can isolate the related elements in the viewer, and selecting an element in the viewer updates the detail panel. After generation, the dashboard can also be edited: add supported visuals, change chart types, reorder widgets, or remove sections you do not need.

I have found this kind of workflow valuable for teams, and even for individuals, who may not have much experience with analytics tools but still need a fast way to visualize and interact with model data.

This is not meant to replace tools like Power BI. A big part of their value is connecting many data sources, modeling data properly, governance, reporting at scale, and so on. But for fast exploration, especially when the data is already available and you want a usable interface immediately, generative dashboards feel like a very interesting direction.

Tech-wise, this is built with Vercel's json-render packages. The AI model generates a structured UI spec, chooses the appropriate filters and charts based on the prompt, and the app normalizes that into a viewer-first dashboard shell.

You can try it here:
https://json-render-dashboard-mu.vercel.app/

Reference:
https://github.com/vercel-labs/json-render
