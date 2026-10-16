import api from "./axios";

export async function listAdvisoryQueries(status) {
  const params = status ? { status } : {};
  const { data } = await api.get("advisory/queries/", { params });
  return data;
}

export async function createAdvisoryQuery(question, scanId) {
  const payload = scanId != null ? { question, scan: scanId } : { question };
  const { data } = await api.post("advisory/queries/", payload);
  return data;
}

export async function answerAdvisoryQuery(id, response) {
  const { data } = await api.patch(`advisory/queries/${id}/`, { response });
  return data;
}
