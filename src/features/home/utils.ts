export const questionCountLabel = (count: number) => {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} вопрос`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} вопроса`;
  }
  return `${count} вопросов`;
};

export const progressivePlanLabel = (count: number) => {
  if (count <= 5) return "План: легкий -> средний -> сложный -> сложный -> сложный";
  if (count === 6) {
    return "План: легкий -> средний -> средний -> сложный -> сложный -> сложный";
  }
  return "План: легкий -> средний -> средний -> сложный -> сложный -> сложный -> сложный";
};
