export function App() {
    return (
        <div>
            <div>
                设置
            </div>
            <div>
                <input></input>
            </div>
            {
                Array.from({ length: 100 }).map((_, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={index} className="border-b border-border">
                        <p className="text-text">
                            设置项
                            {index + 1}
                        </p>
                    </div>
                ))
            }
        </div>
    );
}
